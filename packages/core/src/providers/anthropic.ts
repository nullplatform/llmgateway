// packages/core/src/providers/anthropic.ts

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
    IProvider,
    IProviderFactory,
    ILLMRequest,
    ILLMResponse,
    IUsage,
    IMessage, IContent, IChunkEmitter, IPluginPhaseExecution, LLMModelError
} from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';

export interface AnthropicProviderConfig {
    bypassModel: boolean;
    baseUrl?: string;
    model?: string;
    apiKey: string;
    retryAttempts?: number;
    retryDelay?: number; // in milliseconds
    version?: string; // API version
    maxTokens?: number; // Default max tokens for Anthropic
}

interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | Array<{
        type: 'text';
        text: string;
    }>;
}
interface AnthropicTool {
    name: string;
    description: string;
    input_schema: Record<string, any>;
}
interface AnthropicRequest {
    model: string;
    max_tokens: number;
    messages: AnthropicMessage[];
    temperature?: number;
    top_p?: number;
    stop_sequences?: string[];
    stream?: boolean;
    system?: string;
    tool_choice?: {
        type?: 'auto' | 'none';
        disable_parallel_tool_use?: boolean;
    };
    tools: Array<AnthropicTool>;
}

interface AnthropicResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<{
        type: 'text';
        text: string;
    }>;
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
    stop_sequence?: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

export class AnthropicProvider implements IProvider {
    readonly name = 'anthropic';
    readonly config: AnthropicProviderConfig;
    private client: AxiosInstance;
    private logger: Logger;

    constructor(config: AnthropicProviderConfig, logger: Logger) {
        this.config = {
            baseUrl: config.baseUrl || 'https://api.anthropic.com',
            version: config.version || '2023-06-01',
            maxTokens: config.maxTokens || 4096,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        this.logger = logger;

        this.client = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                'x-api-key': this.config.apiKey,
                'anthropic-version': this.config.version,
                'Content-Type': 'application/json',
                'User-Agent': 'llm-gateway/1.0.0',
            }
        });

        this.setupInterceptors();
    }

    private setupInterceptors(): void {
        // Request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                this.logger.debug('Anthropic request', {
                    method: config.method,
                    url: config.url,
                    headers: { ...config.headers, 'x-api-key': '[REDACTED]' }
                });
                return config;
            },
            (error) => {
                this.logger.error('Anthropic request error', { error });
                return Promise.reject(error);
            }
        );

        // Response interceptor for logging and error handling
        this.client.interceptors.response.use(
            (response) => {
                this.logger.debug('Anthropic response', {
                    status: response.status,
                    headers: response.headers,
                    data: response.data
                });
                return response;
            },
            (error) => {
                this.logger.error('Anthropic response error', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message
                });
                return Promise.reject(this.transformError(error));
            }
        );
    }

    async execute(request: ILLMRequest): Promise<ILLMResponse> {
        const endpoint = '/v1/messages';



        try {
            const anthropicRequest = this.transformToAnthropicRequest(request);
            const response = await this.retryRequest(async () => {
                return await this.client.post(endpoint, anthropicRequest);
            });

            return this.transformToLLMResponse(response.data, request);
        } catch (error) {
            this.logger.error('Anthropic request failed', {
                error,
                request: this.sanitizeRequest(request)
            });
            throw new LLMModelError(error);

        }
    }

    private transformToAnthropicRequest(request: ILLMRequest): AnthropicRequest {
        // Extract system message if present
        const messages: Array<AnthropicMessage> = request.messages.map((message) => {
            let role = message.role || 'user';
            let content: any = message.content;
            if(message.role === 'system') {
                role = 'assistant'
            }
            if(role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
                content = [];
                message.tool_calls.forEach(toolCall => {
                    let input = {};
                    try {
                        input = JSON.parse(toolCall.function.arguments)
                    }catch (e) {}
                    content.push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        input
                    });
                });
            }
            if (message.role === 'tool') {
                role = 'user'; // Anthropic treats tool messages as assistant messages
                content = [{
                    type: 'tool_result',
                    content: message.content,
                    tool_use_id: message.tool_call_id
                }];
            }
            return{
                role,
                content
            } as  AnthropicMessage
        })
              // Ensure messages alternate between user and assistant

        const anthropicRequest: AnthropicRequest = {
            model: this.config.bypassModel ? request.model : this.config.model || request.model,
            max_tokens: request.max_tokens || this.config.maxTokens!,
            messages: messages,
            temperature: request.temperature,
            top_p: request.top_p,
            stream: false, //BY now not supported
            tools: request?.tools?.map(tool => ({
                name: tool.function.name,
                description: tool.function.description || '',
                input_schema: tool.function.parameters || {}
            }))
        };

        if(anthropicRequest.tools?.length > 0) {
            anthropicRequest.tool_choice = {
                type: request.tool_choice || 'auto',
            }
        }


        // Add stop sequences
        if (request.stop) {
            anthropicRequest.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
        }

        return anthropicRequest;
    }


    private transformToLLMResponse(anthropicResponse: AnthropicResponse, originalRequest: ILLMRequest): ILLMResponse {
        // Extract text content from Anthropic's content array

        let lastContent
        if (Array.isArray(anthropicResponse.content)) {
            lastContent = anthropicResponse.content[anthropicResponse.content.length - 1];
        } else {
            lastContent = anthropicResponse.content;
        }
        let message
        if(lastContent.type === 'tool_use') {
            message = {
                role: 'tool',
                content: anthropicResponse.content[0]?.text,
                tool_calls: [
                    {
                        id: lastContent.id,
                        type: 'function',
                        function: {
                            name: lastContent.name,
                            arguments: lastContent.input
                        }
                    }
                ],
                tool_call_id: lastContent.id
            }
        } else {
            message = {
                role: 'assistant',
                content: lastContent.text
            }
        }
        const content: IContent = {
            index: 0,
            message,
            finish_reason: this.mapFinishReason(anthropicResponse.stop_reason)
        };

        const usage: IUsage = {
            prompt_tokens: anthropicResponse.usage.input_tokens,
            completion_tokens: anthropicResponse.usage.output_tokens,
            total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
        };

        return {
            id: anthropicResponse.id,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: anthropicResponse.model,
            content: [content],
            usage,
            system_fingerprint: `anthropic-${this.config.version}`
        };
    }

    private mapFinishReason(anthropicReason: string): IContent['finish_reason'] {
        if(anthropicReason === undefined || anthropicReason === null) {
            return undefined;
        }
        switch (anthropicReason) {
            case 'end_turn':
                return 'stop';
            case 'max_tokens':
                return 'length';
            case 'stop_sequence':
                return 'stop';
            case 'tool_use':
                return 'tool_calls';
            default:
                return 'stop';
        }
    }

    async executeStreaming(request: ILLMRequest, chunkEmitter: IChunkEmitter): Promise<IPluginPhaseExecution | void> {
        const endpoint = '/v1/messages';
        let lastPluginExecution: IPluginPhaseExecution;
        try {
            const anthropicRequest = this.transformToAnthropicRequest(request);
            // Enable streaming for Anthropic
            anthropicRequest.stream = true;

            const response = await this.client.post(endpoint, anthropicRequest, {
                    responseType: 'stream'
                });


            let buffer = '';
            let created = Math.floor(Date.now() / 1000);
            //Anthropic streams cames as event: name \n data: { ... } \n
            let lastParsedEvent: string | null = null;
            response.data.on('data', async (chunk: Buffer) => {
                buffer += chunk.toString('utf-8');

                // Process complete lines
                const lines = buffer.split('\n');
                // Keep the last potentially incomplete line in buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if( trimmedLine.startsWith('event: ')) {
                        // Handle event lines
                        lastParsedEvent = trimmedLine.slice(7).trim(); // Remove 'event: ' prefix
                        continue; // Skip to next line
                    }

                    lastPluginExecution = await this.processAnthropicStreamLine(
                        trimmedLine,
                        lastParsedEvent,
                        chunkEmitter
                    );

                }
            });

            response.data.on('end', async () => {
                const trimmed = buffer.trim()
                if( trimmed) {
                    await this.processAnthropicStreamLine(
                        trimmed,
                        lastParsedEvent,
                        chunkEmitter,
                        true
                    );
                }
            });

            response.data.on('error', (error: Error) => {
                this.logger.error('Anthropic stream error', { error });
                throw error;
            });

            // Wait for stream to complete
            await new Promise<IPluginPhaseExecution | void>((resolve, reject) => {
                response.data.on('end', () => { resolve(lastPluginExecution)});
                response.data.on('error',() => { reject(lastPluginExecution)});
            });

        } catch (error) {
            this.logger.error('Anthropic streaming request failed', {
                error,
                request: this.sanitizeRequest(request)
            });
            throw new LLMModelError(error);
        }
    }

    private async processAnthropicStreamLine(
        line: string,
        eventType: string | null,
        chunkEmitter: IChunkEmitter,
        lastChunk: boolean = false
    ): Promise<IPluginPhaseExecution | undefined> {
        if (!line.startsWith('data: ')) {
            return;
        }


        const data = line.slice(6); // Remove 'data: ' prefix

        try {
            const parsedChunk = JSON.parse(data);

            // Handle different event types from Anthropic streaming
            switch (eventType) {
                case 'message_start':
                case 'content_block_start':
                case 'content_block_delta':
                case 'message_delta':
                    const content = parsedChunk?.content_block || parsedChunk?.delta || parsedChunk?.message?.content;
                    let delta;
                    let finish_reason;
                    if(content.type === 'text' || content.type === 'text_delta') {
                        delta = {
                            content: content?.text,
                            role: content?.role,
                            stop_reason: this.mapFinishReason(parsedChunk?.stop_reason)
                        }
                    } else if(content.type === 'tool_use' || content.type === 'input_json_delta') {
                        delta = {
                            role: 'tool',
                            tool_calls: [{
                                id: content?.id,
                                type: 'function',
                                function: {
                                    name: content?.name,
                                    arguments: content?.input ? (Object.keys(content?.input).length > 0 ?  JSON.stringify(content?.input) : undefined) : content.partial_json
                                }
                            }],
                            tool_call_id: content.id
                        }
                    } else if(content.stop_reason) {
                            finish_reason = this.mapFinishReason(content.stop_reason);

                    }
                    let usage;
                    const internalUsage = parsedChunk?.usage || parsedChunk?.message?.usage;
                    if(internalUsage) {
                        usage = {
                            prompt_tokens: internalUsage.input_tokens,
                            completion_tokens: internalUsage.output_tokens,
                            total_tokens: internalUsage.input_tokens !== undefined && internalUsage.output_tokens !==undefined
                                ? internalUsage.input_tokens + internalUsage.output_tokens : undefined
                        }
                    }
                    await chunkEmitter.onData({
                        id: parsedChunk?.message?.id,
                        object: 'chat.completion.chunk',
                        model: parsedChunk?.message?.model,
                        content: [
                            {
                                delta: delta,
                                finish_reason
                            }
                        ],
                        usage
                    } as ILLMResponse, false); // Emit a chunk with the parsed data
                    break;

                case 'message_stop':
                    return await chunkEmitter.onData(undefined, true); // Emit final chunk

                default:
                    // Log unknown event types for debugging
                    this.logger.debug('Unknown Anthropic stream event type', {
                        type: parsedChunk.type,
                        data: parsedChunk
                    });
            }
        } catch (error) {
            this.logger.error('Failed to parse Anthropic stream chunk', {
                data,
                error: error instanceof Error ? error.message : error
            });

            // Continue processing instead of throwing - streaming should be resilient
        }
    }

    private async retryRequest<T>(requestFn: () => Promise<T>): Promise<T> {
        let lastError: Error;

        for (let attempt = 1; attempt <= this.config.retryAttempts!; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error as Error;

                // Don't retry on client errors (4xx)
                if (error.response?.status >= 400 && error.response?.status < 500) {
                    throw error;
                }

                if (attempt < this.config.retryAttempts!) {
                    const delay = this.config.retryDelay! * Math.pow(2, attempt - 1); // exponential backoff
                    this.logger.warn(`Anthropic request failed, retrying in ${delay}ms`, {
                        attempt,
                        error: error.message
                    });
                    await this.sleep(delay);
                }
            }
        }

        throw lastError!;
    }

    private transformError(error: any): Error {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            // Anthropic specific error handling
            if (data?.error) {
                const anthropicError = data.error;
                const message = `Anthropic API Error (${status}): ${anthropicError.message}`;

                const transformedError = new Error(message);
                (transformedError as any).status = status;
                (transformedError as any).type = anthropicError.type;

                return transformedError;
            }

            return new Error(`Anthropic API Error (${status}): ${error.message}`);
        }

        if (error.code === 'ECONNABORTED') {
            return new Error('Anthropic API request timeout');
        }

        return error;
    }

    private sanitizeRequest(request: ILLMRequest): any {
        // Remove sensitive data for logging
        const sanitized = { ...request };
        if (sanitized.messages) {
            sanitized.messages = sanitized.messages.map((msg: any) => ({
                ...msg,
                content: msg.content?.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content
            }));
        }
        return sanitized;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export class AnthropicProviderFactory implements IProviderFactory<AnthropicProviderConfig> {
    readonly name = 'Anthropic Provider Factory';
    readonly type = 'anthropic';

    create(config: AnthropicProviderConfig, logger?: Logger): IProvider<AnthropicProviderConfig> {
        return new AnthropicProvider(config, logger || new Logger());
    }
}