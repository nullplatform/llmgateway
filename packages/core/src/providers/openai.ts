// packages/core/src/providers/openai.ts

import axios, {AxiosError, AxiosInstance, AxiosRequestConfig} from 'axios';
import {IProvider, IProviderFactory, ILLMRequest, ILLMResponse, IChunkEmitter} from '@nullplatform/llm-gateway-sdk';
import {Logger} from '../utils/logger.js';
import {OpenAIRequest} from "../adapters/openai";

export interface OpenAIProviderConfig {
    bypassModel: boolean;
    baseUrl?: string;
    model?: string
    apiKey: string;
    retryAttempts?: number;
    retryDelay?: number; // in milliseconds
}

export class OpenAIProvider implements IProvider {
    readonly name = 'openai';
    readonly config: OpenAIProviderConfig;
    private client: AxiosInstance;
    private logger: Logger;

    constructor(config: OpenAIProviderConfig, logger: Logger) {
        this.config = {
            baseUrl: config.baseUrl || 'https://api.openai.com/v1',
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000, // default to 1 second
            ...config
        };


        this.logger = logger;

        this.client = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
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
                this.logger.debug('OpenAI request', {
                    method: config.method,
                    url: config.url,
                    headers: { ...config.headers, Authorization: '[REDACTED]' }
                });
                return config;
            },
            (error) => {
                this.logger.error('OpenAI request error', { error });
                return Promise.reject(error);
            }
        );

        // Response interceptor for logging and error handling
        this.client.interceptors.response.use(
            (response) => {
                this.logger.debug('OpenAI response', {
                    status: response.status,
                    headers: response.headers,
                    data: response.data
                });
                return response;
            },
            (error) => {
                this.logger.error('OpenAI response error', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message
                });
                return Promise.reject(this.transformError(error));
            }
        );
    }

    async executeStreaming(request: ILLMRequest, chunkEmitter: IChunkEmitter): Promise<void> {
        const httpRequest = this.buildOpenAIRequest(request);
        httpRequest.stream_options = { include_usage: true };
        const endpoint = '/chat/completions';

        try {
            const response = await this.client.post(endpoint, httpRequest, {
                responseType: 'stream'
            });

            let buffer = '';
            let lastChunk: any = null;

            response.data.on('data', async (chunk: Buffer) => {
                buffer += chunk.toString('utf-8');
                // Process complete lines
                const lines = buffer.split('\n');
                // Keep the last potentially incomplete line in buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim()) {
                        await this.processStreamLine(line.trim(), chunkEmitter, lastChunk);
                    }
                }
            });

            response.data.on('end', async () => {
                // Process any remaining data in buffer
                if (buffer.trim()) {
                    await this.processStreamLine(buffer.trim(), chunkEmitter, lastChunk);
                }
            });

            response.data.on('error', (error: Error) => {
                this.logger.error('Stream error', { error });
                throw error;
            });

            // Wait for stream to complete
            await new Promise<void>((resolve, reject) => {
                response.data.on('end', resolve);
                response.data.on('error', reject);
            });

        } catch (error) {
            this.logger.error('Streaming request failed', { error });
            throw error;
        }
    }

    private async processStreamLine(line: string, chunkEmitter: IChunkEmitter, lastChunk: any): Promise<void> {
        if (!line.startsWith('data: ')) {
            return;
        }

        const data = line.slice(6); // Remove 'data: ' prefix

        if (data === '[DONE]') {
            await this.emitFinalChunk(chunkEmitter, lastChunk);
            return;
        }

        try {
            const parsedChunk = JSON.parse(data);
            lastChunk = parsedChunk;
            await this.emitStreamChunk(chunkEmitter, parsedChunk);
        } catch (error) {
            this.logger.error('Failed to parse OpenAI stream chunk', {
                data,
                error: error instanceof Error ? error.message : error
            });
            // Continue processing instead of throwing - streaming should be resilient
        }
    }

    private async emitStreamChunk(chunkEmitter: IChunkEmitter, parsedChunk: any): Promise<void> {
        const choice = parsedChunk.choices?.[0];

        const response: ILLMResponse = {
            id: parsedChunk.id,
            object: parsedChunk.object,
            created: parsedChunk.created,
            model: parsedChunk.model,
            content: choice ? [{
                index: choice.index,
                logprobs: choice.logprobs,
                finish_reason: choice.finish_reason,
                message: choice.message,
                delta: choice.delta
            }]:undefined,
            usage: parsedChunk.usage
        };

        await chunkEmitter.onData(response, false);
    }

    private async emitFinalChunk(chunkEmitter: IChunkEmitter, lastChunk: any): Promise<void> {

        let finalResponse: ILLMResponse = null;

        if( lastChunk) {
            finalResponse = {
                id: lastChunk.id,
                object: lastChunk.object,
                created: lastChunk.created,
                model: lastChunk.model,
                content: [{
                    index: lastChunk.choices[0].index,
                    logprobs: lastChunk.choices[0].logprobs,
                    finish_reason: lastChunk.choices[0].finish_reason,
                    message: lastChunk.choices[0].message,
                    delta: lastChunk.choices[0].delta
                }],
                usage: lastChunk.usage
            };
        }

        await chunkEmitter.onData(finalResponse, true);
    }

    buildOpenAIRequest(request: ILLMRequest): OpenAIRequest {
        return {
            model: this.config.bypassModel ? request.model : this.config.model,
            messages: request.messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                name: msg.name,
                tool_calls: msg.tool_calls,
                tool_call_id: msg.tool_call_id
            })),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p > 0 && request.top_p < 1? request.top_p : undefined,
            frequency_penalty: request.frequency_penalty,
            presence_penalty: request.presence_penalty,
            stop: request.stop,
            stream: request.stream,
            tools: request.tools,
            tool_choice: request.tool_choice,

        } as OpenAIRequest;
    }

    async execute(request: ILLMRequest): Promise<ILLMResponse> {
        const endpoint = '/chat/completions';

        const httpRequest = this.buildOpenAIRequest(request);

        try {
            const response = await this.retryRequest(async () => {
                return await this.client.post(endpoint, httpRequest);
            });

            return {
                id: response.data.id,
                object: response.data.object,
                created: response.data.created,
                model: response.data.model,
                usage: response.data.usage,
                content: [
                    {
                        ...response.data.choices[0],
                        message: response.data.choices[0]?.message
                    }
                ]
            } as ILLMResponse;
        } catch (error) {
            this.logger.error('OpenAI request failed', { error, request: this.sanitizeRequest(request) });
            throw error;
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
                    this.logger.warn(`OpenAI request failed, retrying in ${delay}ms`, {
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

            // OpenAI specific error handling
            if (data?.error) {
                const openaiError = data.error;
                const message = `OpenAI API Error (${status}): ${openaiError.message}`;

                const transformedError = new Error(message);
                (transformedError as any).status = status;
                (transformedError as any).type = openaiError.type;
                (transformedError as any).code = openaiError.code;
                (transformedError as any).param = openaiError.param;

                return transformedError;
            }

            return new Error(`OpenAI API Error (${status}): ${error.message}`);
        }

        if (error.code === 'ECONNABORTED') {
            return new Error('OpenAI API request timeout');
        }

        return error;
    }

    private sanitizeRequest(request: any): any {
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

export class OpenAIProviderFactory implements IProviderFactory<OpenAIProviderConfig> {
    readonly name = 'OpenAI Provider Factory';
    readonly type = 'openai';

    create(config: OpenAIProviderConfig, logger?: Logger): IProvider<OpenAIProviderConfig> {
        return new OpenAIProvider(config, logger || new Logger());
    }
}