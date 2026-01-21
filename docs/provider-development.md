# Provider Development Guide

This guide covers how to create custom providers for the LLM Gateway to integrate with new LLM services and APIs.

## Provider Architecture Overview

Providers are responsible for executing requests against actual LLM services. They receive standardized `ILLMRequest` objects from the gateway and return standardized `ILLMResponse` objects, handling the communication with the underlying LLM API.

## Core Interface

All providers must implement the `IProvider` interface:

```typescript
import { IProvider, ILLMRequest, ILLMResponse, IChunkEmitter, ExtensionMetadata } from '@nullplatform/llm-gateway-sdk';

export interface IProvider extends IConfigurableExtension {
    readonly name: string;
    
    execute(request: ILLMRequest): Promise<ILLMResponse>;
    executeStreaming(request: ILLMRequest, chunkEmitter: IChunkEmitter): Promise<ILLMPluginPhaseExecution | void>;
    configure(config: any): Promise<void>;
    validateConfig?(config: any): Promise<boolean | string>;
}
```

## Creating a Provider

### Basic Provider Structure

```typescript
import { IProvider, ILLMRequest, ILLMResponse, IChunkEmitter, ExtensionMetadata } from '@nullplatform/llm-gateway-sdk';
import axios, { AxiosInstance, AxiosError } from 'axios';

// Configuration interface for your provider
export interface MyProviderConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    bypassModel?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
    timeout?: number;
    customHeaders?: Record<string, string>;
}

@ExtensionMetadata({
    name: 'my-provider',
    version: '1.0.0',
    description: 'Provider for My LLM Service',
    configurationSchema: {
        type: 'object',
        properties: {
            apiKey: { type: 'string' },
            baseUrl: { type: 'string', default: 'https://api.myprovider.com' },
            model: { type: 'string', default: 'my-model-default' },
            bypassModel: { type: 'boolean', default: false },
            retryAttempts: { type: 'number', default: 3 },
            retryDelay: { type: 'number', default: 1000 },
            timeout: { type: 'number', default: 30000 }
        },
        required: ['apiKey']
    }
})
export class MyProvider implements IProvider {
    readonly name = 'my-provider';
    private config: MyProviderConfig;
    private client: AxiosInstance;
    private logger: Logger;
    
    constructor(logger: Logger) {
        this.logger = logger;
    }
    
    async configure(config: MyProviderConfig): Promise<void> {
        this.config = {
            baseUrl: 'https://api.myprovider.com',
            retryAttempts: 3,
            retryDelay: 1000,
            timeout: 30000,
            bypassModel: false,
            ...config
        };
        
        this.setupHttpClient();
    }
    
    async validateConfig(config: any): Promise<boolean | string> {
        if (!config.apiKey || typeof config.apiKey !== 'string') {
            return 'apiKey is required and must be a string';
        }
        
        if (config.baseUrl && !this.isValidUrl(config.baseUrl)) {
            return 'baseUrl must be a valid URL';
        }
        
        if (config.timeout && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
            return 'timeout must be a positive number';
        }
        
        return true;
    }
    
    async execute(request: ILLMRequest): Promise<ILLMResponse> {
        // Non-streaming execution
    }
    
    async executeStreaming(request: ILLMRequest, chunkEmitter: IChunkEmitter): Promise<void> {
        // Streaming execution
    }
}
```


### Streaming Execution

Implement streaming support for real-time responses, the object chunkEmitter should be used to emit chunks as they are received:

```typescript
async executeStreaming(request: ILLMRequest, chunkEmitter: IChunkEmitter): Promise<void> {
    try {
        // Transform request and enable streaming
        const providerRequest = {
            ...this.transformRequest(request),
            stream: true
        };
        
        // Make streaming request
        const response = await this.client.post('/v1/completions', providerRequest, {
            responseType: 'stream'
        });
        
        let accumulated: ILLMResponse = this.createEmptyResponse(request);
        let isFirstChunk = true;
        
        // Process streaming response
        response.data.on('data', (chunk: Buffer) => {
            try {
                const lines = chunk.toString().split('\\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        
                        if (data === '[DONE]') {
                            // End of stream
                            chunkEmitter.emitChunk(accumulated, false, true);
                            return;
                        }
                        
                        try {
                            const parsedChunk = JSON.parse(data);
                            const transformedChunk = this.transformStreamChunk(parsedChunk, request, accumulated);
                            
                            // Accumulate the chunk
                            this.accumulateChunk(accumulated, transformedChunk);
                            
                            // Emit the chunk
                            chunkEmitter.emitChunk(transformedChunk, isFirstChunk, false);
                            isFirstChunk = false;
                            
                        } catch (parseError) {
                            this.logger.warn('Failed to parse stream chunk', {
                                provider: this.name,
                                data,
                                error: parseError.message
                            });
                        }
                    }
                }
            } catch (error) {
                this.logger.error('Stream processing error', {
                    provider: this.name,
                    error: error.message
                });
                chunkEmitter.emitError(this.transformError(error));
            }
        });
        
        response.data.on('error', (error: Error) => {
            this.logger.error('Stream error', {
                provider: this.name,
                error: error.message
            });
            chunkEmitter.emitError(this.transformError(error));
        });
        
        response.data.on('end', () => {
            if (isFirstChunk) {
                // No chunks were emitted, emit final empty chunk
                chunkEmitter.emitChunk(accumulated, true, true);
            }
        });
        
    } catch (error) {
        this.logger.error('Streaming execution error', {
            provider: this.name,
            error: error.message
        });
        throw this.transformError(error);
    }
}

private createEmptyResponse(request: ILLMRequest): ILLMResponse {
    return {
        id: `response-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: request.model,
        choices: [{
            index: 0,
            message: {
                role: 'assistant',
                content: ''
            },
            finish_reason: null
        }],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        },
        metadata: {
            provider: this.name,
            request_id: request.metadata?.request_id
        }
    };
}

```


## Provider Registration

Configure providers in the gateway configuration:

```yaml
availableExtensions:
  - path: ./modules/myProvider/index.js
  - module: '@my-org/custom-provider'

# Model routing to providers  
models:
  - name: my-model-small
    type: my-provider
    config:
      apiKey: "${MY_PROVIDER_API_KEY}"
      baseUrl: "https://api.myprovider.com"
      model: "my-default-model"
      retryAttempts: 5
      customHeaders:
        "X-Custom-Header": "value"

```
