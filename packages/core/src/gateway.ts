import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { PluginManager } from './plugins/manager';
import {ConfigLoader} from './config/loader';
import { Logger } from './utils/logger.js';
import { LLMApiAdapterRegistry } from './adapters/registry.js';
import { ModelRegistry } from './models/modelRegistry.js';
import { ProviderRegistry } from './providers/providerRegistry.js';
import {
    ILLMResponse, IModel,
    INativeAdapter,
    IPluginPhaseExecution,
    IRequestContext,
    IToolCall, LLMModelError
} from '@nullplatform/llm-gateway-sdk';
import {ILLMApiAdapter} from "@nullplatform/llm-gateway-sdk";
import {GatewayConfig} from "./config/gatewayConfig";
import {PluginFactory} from "./plugins/factory";
export interface ProjectRuntime {
    name: string;
    isDefault?: boolean;
    description?: string;
    models: GatewayConfig['models'];
    pipelineManager: PluginManager;
    llmApiAdapters: LLMApiAdapterRegistry;
    modelRegistry: ModelRegistry;
}
export class GatewayServer {
    private app: express.Application;
    private configLoader: ConfigLoader;
    private logger: Logger;
    private config: GatewayConfig;
    private pluginFactory: PluginFactory;
    private projects: Record<string,ProjectRuntime> = {};
    private maxRetries;
    private providersRegistry: ProviderRegistry;

    constructor(config: string | GatewayConfig) {
        this.app = express();
        this.logger = new Logger();
        if(typeof config === 'string') {
            this.configLoader = new ConfigLoader(config);
        } else {
            this.config = config;
        }
    }

    private setupMiddleware(): void {
        // Security middleware
        this.app.use(helmet());

        // CORS
        this.app.use(cors({
            origin: this.configLoader.get('server.cors.origins', ['*']),
            credentials: true
        }));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Request ID middleware
        this.app.use((req, res, next) => {
            req.id = req.headers['x-request-id'] as string || uuidv4();
            res.setHeader('x-request-id', req.id);
            next();
        });

        // Logging middleware
        this.app.use((req, res, next) => {
            this.logger.info('Incoming request', {
                request_id: req.id,
                method: req.method,
                path: req.path,
                user_agent: req.headers['user-agent'],
                ip: req.ip
            });
            next();
        });
    }

    private async setupRoutes(): Promise<void> {

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });

        // Main LLM proxy endpoints
        await this.setupLLMRoutes();

    }

    private async setupLLMRoutes(): Promise<void> {
        // OpenAI-compatible endpoint
        for (const [projectName, project] of Object.entries(this.projects)) {
            const projectPath = project.isDefault ? '' : `/${projectName}`;

            for (const adapterName of project.llmApiAdapters.getAvailableAdapters()) {
                const adapter = project.llmApiAdapters.get(adapterName);
                for (const basePath of adapter.basePaths) {
                    this.app.post(`${projectPath}/${adapterName}${basePath}`, this.handleLLMRequest(adapter, project));
                }
                if (adapter.getNativeAdapters) {
                    const nativeAdapters: Array<INativeAdapter> = await adapter.getNativeAdapters();
                    for (const nativeAdapter of nativeAdapters) {
                        this.app[nativeAdapter.method](`${projectPath}/${adapterName}${nativeAdapter.path}`, async (req, res) => {
                            await nativeAdapter.doRequest({
                                method: req.method,
                                url: req.originalUrl,
                                headers: req.headers as Record<string, string>,
                                body: req.body
                            }, res);
                        });
                    }
                }
            }
        }

    }

     private handleLLMRequest(adapter: ILLMApiAdapter, project: ProjectRuntime): express.RequestHandler {
        return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            let retry_count = 0;
            const startTime = new Date();
            let reevaluateRequest = true;
            while(reevaluateRequest && retry_count < this.maxRetries) {
                reevaluateRequest = false;
                // Create request context
                let context: IRequestContext = {
                    project: project.name,
                    adapter: adapter.name,
                    httpRequest: {
                        method: req.method,
                        url: req.originalUrl,
                        headers: req.headers as Record<string, string>,
                        body: req.body
                    },
                    available_models: project.modelRegistry.getAvailableModels(),
                    request_id: req.id!,
                    request: req.body, // Will be transformed by input adapter
                    plugin_data: new Map(),
                    metrics: {
                        start_time: startTime
                    },
                    headers: req.headers as Record<string, string>,
                    query_params: req.query as Record<string, string>,
                    client_ip: req.ip,
                    user_agent: req.headers['user-agent'],
                    metadata: {},
                    retry_count: retry_count++,
                };
                try {




                    // Transform input to standard format
                    context.request = await adapter.transformInput(req.body);
                    context.request.metadata = {
                        ...context.request.metadata,
                        original_provider: adapter.name
                    };

                    // Execute plugin plugins
                    const beforeModelExecution = await project.pipelineManager.beforeModel(context);
                    if (beforeModelExecution.finalResult.success === false) {
                        const error = beforeModelExecution.finalResult.error || new Error(`Plugin execution failed [${beforeModelExecution.finalResult.pluginName}]`);

                        // If the plugin execution failed, return the error response
                        res.status(beforeModelExecution.finalResult.status || 500).json({
                            error: "message" in error && error.message ? error.message : error,
                            request_id: context.request_id
                        });
                        return;
                    }
                    if( beforeModelExecution.finalResult.reevaluateRequest) {
                        reevaluateRequest = true;
                        continue;
                    }
                    context = {
                        ...context,
                        ...beforeModelExecution.finalResult.context,
                    }
                    // Determine a target model
                    const targetModel = beforeModelExecution.finalResult.context.target_model;

                    const model = project.modelRegistry.get(targetModel);

                    context.target_model = model.name;
                    context.target_model_provider = model.provider.name;
                    if (!model) {
                        throw new Error(`Model '${targetModel}' not configured`);
                    }

                    let pluginResultPost: void | IPluginPhaseExecution = undefined;
                    if (context.request.stream) {
                        pluginResultPost = await this.handleStreamingLLMRequest(context, model, adapter, targetModel, req, res, project);

                    } else {
                        pluginResultPost = await this.handleNonStreamingLLMRequest(context, model, adapter, targetModel, req, res, project);
                    }

                    if( pluginResultPost && pluginResultPost.finalResult.reevaluateRequest) {
                        // If the plugin execution returned reevaluateRequest, we need to re-evaluate the request
                        reevaluateRequest = true;
                        continue;
                    }

                } catch (error) {
                    if( error instanceof LLMModelError || error.name === 'LLMModelError') {
                        context.error = error;
                        const onModelError = await project.pipelineManager.onModelError(context);
                        if( onModelError && onModelError.finalResult.reevaluateRequest) {
                            // If the plugin execution returned reevaluateRequest, we need to re-evaluate the request
                            reevaluateRequest = true;
                            continue;
                        }

                    }
                    next(error);
                }
            }
        };
    }

    private mergeChunks(
        accumulatedResponse: Partial<ILLMResponse> = {},
        chunk: Partial<ILLMResponse> = {},
        messageContentDelta: boolean = true
    ): ILLMResponse {
        const messageContentKey = messageContentDelta ? 'delta' : 'message';
        const merged: ILLMResponse = {
            id: chunk?.id || accumulatedResponse?.id,
            object: chunk?.object || accumulatedResponse.object,
            created: chunk?.created || accumulatedResponse.created,
            model: chunk?.model || accumulatedResponse?.model,
            content: [],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            },
            system_fingerprint: chunk?.system_fingerprint || accumulatedResponse?.system_fingerprint,
            ...structuredClone(accumulatedResponse)
        }

        const lastContentIndex = Math.max(merged.content?.length -1 || 0,0);
        const chunkIndex = Math.max(merged?.content?.length -1 || 0, 0);
        if(!merged.content[lastContentIndex]) {
            merged.content[lastContentIndex] = {
                index: lastContentIndex,
                [messageContentKey]: {}
            };
        }

        const chunkContent = chunk?.content?.[chunkIndex]?.delta || chunk?.content?.[chunkIndex]?.message
        const chunkContentMessage = chunkContent?.content;
        if(chunkContentMessage !== undefined && chunkContentMessage !== null) {
            merged.content[lastContentIndex][messageContentKey].content = `${merged?.content?.[chunkIndex]?.[messageContentKey]?.content || ''}${chunkContentMessage}`;
        }

        if(chunkContent?.role) {
            merged.content[lastContentIndex][messageContentKey].role = chunkContent.role;
        }

        merged.content[lastContentIndex].finish_reason = merged.content[lastContentIndex].finish_reason || chunk?.content?.[chunkIndex]?.finish_reason;
        if(chunk?.content?.[chunkIndex]?.delta?.tool_calls || chunk?.content?.[chunkIndex]?.message?.tool_calls) {
            if(!merged?.content[lastContentIndex]?.[messageContentKey]?.tool_calls) {
                merged.content[lastContentIndex][messageContentKey].tool_calls = [];
            }
            const toolCalls = chunk?.content?.[chunkIndex]?.delta?.tool_calls || chunk?.content?.[chunkIndex]?.message?.tool_calls || [];
            for (const toolCall of toolCalls) {
                if(toolCall.id) {
                    merged.content?.[0][messageContentKey].tool_calls.push(toolCall)
                } else {
                    const existingCalls = merged.content?.[lastContentIndex][messageContentKey].tool_calls;
                    const existingTool= existingCalls?.[existingCalls.length - 1];
                    if(existingTool && existingTool.function) {
                        // If the tool call is a continuation of the last one, append to it
                        existingTool.function.arguments = (existingTool.function.arguments || '') + (toolCall.function?.arguments || '');
                    } else {
                        // Otherwise, add a new tool call
                        merged.content[lastContentIndex][messageContentKey].tool_calls.push(toolCall);
                    }
                }

            }
        }
        // Merge usage
        if(chunk?.usage) {
            if(merged.usage === undefined || merged.usage === null) {
                // @ts-ignore
                merged.usage = {};
            }
            for(const [entry,value] of Object.entries(chunk.usage)) {
                if(value !== undefined) {
                    merged.usage[entry] = value;
                }
            }
        }
        return merged;
    }

    private async handleStreamingLLMRequest(
        context: IRequestContext,
        model: IModel,
        adapter: ILLMApiAdapter,
        targetModel: string,
        req: express.Request,
        res: express.Response,
        project: ProjectRuntime
    ): Promise<IPluginPhaseExecution | void> {
        let accumulatedResponse: ILLMResponse = undefined;
        let bufferedChunks: Array<ILLMResponse> = [];
        let bufferedChunk: ILLMResponse | undefined = undefined;
        let firstChunkEmitted = false;
        return await model.provider.executeStreaming(context.request, {
            onData: async (chunk: ILLMResponse, finalChunk: boolean): Promise<IPluginPhaseExecution | undefined> => {
                try {
                    const internalContext: IRequestContext = {
                        ...context,
                    };
                    bufferedChunk = this.mergeChunks(bufferedChunk, chunk);

                    internalContext.response = undefined;
                    internalContext.chunk = chunk;
                    internalContext.bufferedChunk = bufferedChunk;
                    internalContext.finalChunk = finalChunk;
                    internalContext.accumulated_response = accumulatedResponse;

                    if (accumulatedResponse === undefined) {
                        res.status(200);
                        res.setHeader('Transfer-Encoding', 'chunked');
                        // @ts-ignore
                        accumulatedResponse = {
                            id: chunk?.id,
                            object: chunk?.object,
                            created: chunk?.created,
                            model: chunk?.model,
                            usage: chunk?.usage,
                            content: [{
                                index: 0,
                                message: chunk?.content[0]?.message || chunk?.content[0]?.delta || {}
                            }]
                        };
                    }

                    const afterModelExecution = await project.pipelineManager.afterChunk(internalContext);

                    if(afterModelExecution.finalResult.reevaluateRequest) {
                        //After first chunk is emitted, reevaluate the request is not allowed
                        if(firstChunkEmitted) {
                            throw new Error('Reevaluating request after first chunk is not allowed in streaming mode');
                        } else {
                            return afterModelExecution;
                        }
                    }
                    if (afterModelExecution.finalResult.success === false) {
                        // If the plugin execution failed, return the error response
                        res.json({
                            error: afterModelExecution.finalResult.error || 'Plugin execution failed',
                            request_id: context.request_id,
                            message: afterModelExecution.finalResult.error || 'An error occurred during plugin execution'
                        });
                        res.end();
                        return afterModelExecution;

                    } else {
                        bufferedChunk = afterModelExecution.finalResult.context.bufferedChunk || bufferedChunk;

                        const shouldEmmit = afterModelExecution.finalResult.emitChunk !== undefined ? afterModelExecution.finalResult.emitChunk : true;

                        if (shouldEmmit) {
                            accumulatedResponse = this.mergeChunks(accumulatedResponse, bufferedChunk, false);

                            const resp = await adapter.transformOutputChunk(internalContext.request, req.body, bufferedChunk, !firstChunkEmitted, finalChunk, accumulatedResponse);
                            firstChunkEmitted = true;

                            res.write(resp.toString('utf-8'));
                            bufferedChunk = undefined;
                        }
                    }
                    if (finalChunk) {
                        internalContext.response = accumulatedResponse;
                        internalContext.accumulated_response = accumulatedResponse;
                        internalContext.metrics.end_time = new Date(Date.now());
                        internalContext.metrics.duration_ms = internalContext.metrics.end_time.getTime() -internalContext.metrics.start_time.getTime();
                        internalContext.metrics.input_tokens = internalContext.accumulated_response.usage?.prompt_tokens || 0;
                        internalContext.metrics.output_tokens = internalContext.accumulated_response.usage?.completion_tokens || 0;
                        internalContext.metrics.total_tokens = internalContext.metrics.input_tokens + internalContext.metrics.output_tokens;
                        //Do not wait is fully async operation
                        project.pipelineManager.detachedAfterResponse(internalContext);
                        res.end();
                        return afterModelExecution;
                    }

                }catch(error) {
                    this.logger.error('Error processing streaming chunk', error);
                    throw error;

                }
            }
        });
    }


    private async handleNonStreamingLLMRequest(
        context: IRequestContext,
        model: any,
        adapter: ILLMApiAdapter,
        targetModel: string,
        req: express.Request,
        res: express.Response,
        project: ProjectRuntime
    ): Promise<IPluginPhaseExecution | undefined> {
        const providerResponse = await model.provider.execute(context.request);

        // Update context with response
        context.response = providerResponse;
        context.metrics.end_time =new Date();
        context.metrics.duration_ms = context.metrics.end_time.getTime() - context.metrics.start_time.getTime();
        context.metrics.input_tokens = providerResponse.usage?.prompt_tokens || 0;
        context.metrics.output_tokens = providerResponse.usage?.completion_tokens || 0;
        context.metrics.total_tokens = context.metrics.input_tokens + context.metrics.output_tokens;
        // Execute post-processing plugins
        const afterModelExecution = await project.pipelineManager.afterModel(context);
        const finalContext = {
            ...context,
            ...afterModelExecution.finalResult.context,
        }
        if(afterModelExecution.finalResult.reevaluateRequest) {
            return afterModelExecution;
        }
        const resp = await adapter.transformOutput(finalContext.request, req.body, finalContext.response)
        // Send response
        res.send(resp);

        //Do not wait is fully async operation
        project.pipelineManager.detachedAfterResponse(finalContext);

        // Log success
        this.logger.info('Request completed successfully', {
            request_id: context.request_id,
            model: targetModel,
            provider: model.provider.name,
            duration_ms: finalContext.metrics.duration_ms,
            input_tokens: finalContext.metrics.input_tokens,
            output_tokens: finalContext.metrics.output_tokens
        });
    }


    private setupErrorHandling(): void {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Route ${req.method} ${req.path} not found`,
                request_id: req.id
            });
        });

        // Global error handler
        this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            this.logger.error('Request failed', {
                request_id: req.id,
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method
            });

            res.status(500).json({
                error: 'Internal Server Error',
                message: error.message,
                request_id: req.id
            });
        });
    }

    async initialize(): Promise<void> {
        if (this.configLoader) {
            await this.configLoader.load();
            this.config = this.configLoader.getConfig();
        }
        this.maxRetries = Math.max(this.config.maxRetries || 3, 1);
        this.pluginFactory = new PluginFactory(this.config.availablePlugins, this.logger);
        await this.pluginFactory.initializePlugins();
        this.providersRegistry = new ProviderRegistry(this.config, this.logger)

        if(this.config.defaultProject) {
            const pipelineManager = new PluginManager(this.config.plugins, this.pluginFactory, this.logger);
            await pipelineManager.loadPlugins();
            const adapters = new LLMApiAdapterRegistry(this.logger);
            await adapters.initializeAdapters();
            const modelRegistry = new ModelRegistry(this.providersRegistry, this.config.models, this.logger);
            await modelRegistry.initializeModels();
            this.projects.default = {
                isDefault: true,
                name: 'default',
                description: 'Default project for LLM Gateway',
                models: this.config.models,
                pipelineManager: pipelineManager,
                llmApiAdapters: adapters,
                modelRegistry: modelRegistry,
            };
            this.logger.info(`Default project initialized with ${Object.keys(this.config.models).length} models`);
        }
        for(const projectConfig of this.config.projects || []) {
            const models = {...this.config.models, ...projectConfig.models};
            const plugins = [...this.config.plugins,...projectConfig.plugins];
            const pipelineManager = new PluginManager(plugins, this.pluginFactory, this.logger);
            await pipelineManager.loadPlugins();
            const adapters = new LLMApiAdapterRegistry(this.logger);
            await adapters.initializeAdapters();
            const modelRegistry = new ModelRegistry(this.providersRegistry, models, this.logger);
            await modelRegistry.initializeModels();
            this.projects[projectConfig.name] = {
                name: projectConfig.name,
                description: projectConfig.description,
                isDefault: false,
                models: projectConfig.models,
                pipelineManager: pipelineManager,
                llmApiAdapters: adapters,
                modelRegistry: modelRegistry
            };
            this.logger.info(`Project '${projectConfig.name}' initialized with ${Object.keys(models).length} models`);
        }
    }

    async start(port: number = 3000): Promise<void> {
        // Load configuration

        await this.initialize();

        this.setupMiddleware();
        await this.setupRoutes();
        this.setupErrorHandling();

        // Start server
        return new Promise((resolve) => {
            this.app.listen(port, () => {
                this.logger.info(`LLM Gateway started on port ${port}`);
                resolve();
            });
        });
    }



    async stop(): Promise<void> {
        this.logger.info('LLM Gateway stopped');
    }
}

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}