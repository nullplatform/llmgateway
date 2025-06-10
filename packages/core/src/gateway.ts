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
import {ILLMResponse, INativeAdapter, IRequestContext, IToolCall} from '@nullplatform/llm-gateway-sdk';
import {ILLMApiAdapter} from "@nullplatform/llm-gateway-sdk";
import {GatewayConfig} from "./config/gatewayConfig";
import {PluginFactory} from "./plugins/factory";
export class GatewayServer {
    private app: express.Application;
    private pipelineManager: PluginManager;
    private configLoader: ConfigLoader;
    private logger: Logger;
    private config: GatewayConfig;
    private llmApiAdapters: LLMApiAdapterRegistry;
    private providerRegistry: ProviderRegistry;
    private modelRegistry: ModelRegistry;
    private pluginFactory: PluginFactory;
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
        for (const adapterName of this.llmApiAdapters.getAvailableAdapters()) {
            const adapter = this.llmApiAdapters.get(adapterName);
            for (const basePath of adapter.basePaths) {
                this.app.post(`/${adapterName}${basePath}`, this.handleLLMRequest(adapter));
            }
            if (adapter.getNativeAdapters) {
                const nativeAdapters: Array<INativeAdapter> = await adapter.getNativeAdapters();
                for (const nativeAdapter of nativeAdapters) {
                    this.app[nativeAdapter.method](`/${adapterName}${nativeAdapter.path}`, async (req, res) => {
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

     private handleLLMRequest(adapter: ILLMApiAdapter) {
        return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const startTime = Date.now();

            try {
                // Create request context
                let context: IRequestContext = {
                    httpRequest: {
                        method: req.method,
                        url: req.originalUrl,
                        headers: req.headers as Record<string, string>,
                        body: req.body
                    },
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
                };


                // Transform input to standard format
                context.request = await adapter.transformInput(req.body);
                context.request.metadata = {
                    ...context.request.metadata,
                    original_provider: adapter.name
                };

                // Execute plugin plugins
                const beforeModelExecution = await this.pipelineManager.beforeModel(context);
                if(beforeModelExecution.finalResult.success === false) {
                    // If the plugin execution failed, return the error response
                    res.status(beforeModelExecution.finalResult.status || 500).json({
                        error: beforeModelExecution.finalResult.error || 'Plugin execution failed',
                        request_id: context.request_id,
                        message: beforeModelExecution.finalResult.error || 'An error occurred during plugin execution'
                    });
                    return;
                }
                context = {
                    ...context,
                    ...beforeModelExecution.finalResult.context,
                }
                // Determine a target model
                const targetModel = beforeModelExecution.finalResult.context.target_model;

                const model = this.modelRegistry.get(targetModel);

                if (!model) {
                    throw new Error(`Model '${targetModel}' not configured`);
                }
                if(context.request.stream) {
                    await this.handleStreamingLLMRequest(context, model, adapter, targetModel, req, res, startTime);

                } else {
                    await this.handleNonStreamingLLMRequest(context, model, adapter, targetModel, req, res, startTime);
                }


            } catch (error) {
                next(error);
            }
        };
    }

    

    private async handleStreamingLLMRequest(
        context: IRequestContext,
        model: any,
        adapter: ILLMApiAdapter,
        targetModel: string,
        req: express.Request,
        res: express.Response,
        startTime: number
    ): Promise<void> {
        let accumulatedResponse: ILLMResponse = undefined;
        const startTimeMs = Date.now();
        await model.provider.executeStreaming(context.request, {
            onData: async (chunk: ILLMResponse, finalChunk: boolean)=> {
                const internalContext: IRequestContext = {
                    ...context,
                };
                internalContext.response = undefined;
                internalContext.chunk = chunk;
                internalContext.finalChunk = finalChunk;
                internalContext.accumulated_response = accumulatedResponse;

                if(accumulatedResponse === undefined) {
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
                } else {
                    // @ts-ignore
                    accumulatedResponse.content[0].message.content = `${accumulatedResponse?.content?.[0]?.message?.content || ''}${chunk?.content?.[0]?.message?.content || chunk?.content?.[0]?.delta?.content || ''}`;
                    accumulatedResponse.content[0].finish_reason = chunk?.content?.[0]?.finish_reason;
                    if(chunk?.content?.[0]?.delta?.tool_calls || chunk?.content?.[0]?.message?.tool_calls) {
                        if(!accumulatedResponse?.content[0]?.message?.tool_calls) {
                            accumulatedResponse.content[0].message.tool_calls = [];
                        }
                        const toolCalls = chunk?.content?.[0]?.delta?.tool_calls || chunk?.content?.[0]?.message?.tool_calls || [];
                        for (const toolCall of toolCalls) {
                            if(toolCall.id) {
                                accumulatedResponse.content?.[0].message.tool_calls.push(toolCall)
                            } else {
                                const existingCalls = accumulatedResponse.content?.[0].message.tool_calls;
                                const existingTool= existingCalls?.[existingCalls.length - 1];
                                if(existingTool && existingTool.function) {
                                    // If the tool call is a continuation of the last one, append to it
                                    existingTool.function.arguments = (existingTool.function.arguments || '') + (toolCall.function?.arguments || '');
                                } else {
                                    // Otherwise, add a new tool call
                                    accumulatedResponse.content[0].message.tool_calls.push(toolCall);
                                }
                            }

                        }
                    }
                    if(chunk?.usage) {
                        if(!accumulatedResponse.usage) {
                            // @ts-ignore
                            accumulatedResponse.usage = {};
                        }
                        accumulatedResponse.usage = { ...accumulatedResponse.usage, ...chunk?.usage};
                    }
                }

                const afterModelExecution = await this.pipelineManager.afterChunk(internalContext);
                if(afterModelExecution.finalResult.success === false) {
                    // If the plugin execution failed, return the error response
                    res.json({
                        error: afterModelExecution.finalResult.error || 'Plugin execution failed',
                        request_id: context.request_id,
                        message: afterModelExecution.finalResult.error || 'An error occurred during plugin execution'
                    });
                    res.end();
                    return;

                } else {
                    const shouldEmmit = afterModelExecution.finalResult.emitChunk !== undefined ? afterModelExecution.finalResult.emitChunk : true;

                    if(shouldEmmit) {
                        const resp = await adapter.transformOutputChunk(internalContext.request, req.body, afterModelExecution.finalResult.context.chunk, finalChunk, accumulatedResponse);
                        res.write(resp.toString('utf-8'));
                    }
                }
                if(finalChunk ) {
                    //Do not wait is fully async operation
                    this.pipelineManager.detachedAfterResponse(internalContext);
                    res.end();
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
        startTime: number
    ): Promise<void> {
        const providerResponse = await model.provider.execute(context.request);

        // Update context with response
        context.response = providerResponse;
        context.metrics.end_time = Date.now();
        context.metrics.duration_ms = context.metrics.end_time - startTime;

        // Execute post-processing plugins
        const afterModelExecution = await this.pipelineManager.afterModel(context);
        const finalContext = {
            ...context,
            ...afterModelExecution.finalResult.context,
        }
        const resp = await adapter.transformOutput(finalContext.request, req.body, finalContext.response)
        // Send response
        res.send(resp);

        //Do not wait is fully async operation
        this.pipelineManager.detachedAfterResponse(finalContext);

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

        this.providerRegistry = new ProviderRegistry(this.config, this.logger);
        this.modelRegistry = new ModelRegistry(this.providerRegistry, this.config, this.logger);
        await this.modelRegistry.initializeModels();
        this.pluginFactory = new PluginFactory(this.config, this.logger);
        await this.pluginFactory.initializePlugins();
        this.pipelineManager = new PluginManager(this.config, this.pluginFactory, this.logger);
        await this.pipelineManager.loadPlugins();
        this.llmApiAdapters = new LLMApiAdapterRegistry(this.logger);
        await this.llmApiAdapters.initializeAdapters();
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