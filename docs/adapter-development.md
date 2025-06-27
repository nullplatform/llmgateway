# Adapter Development Guide

This guide covers how to create custom adapters for the LLM Gateway to support new LLM provider APIs while maintaining compatibility with existing client formats.

## Adapter Architecture Overview

Adapters serve as translation layers between client API formats (like OpenAI's format) and the LLM Gateway's internal standardized format. They handle the bidirectional transformation of requests and responses, enabling clients to use familiar APIs while the gateway routes to different LLM providers.

## Core Interface

All adapters must implement the `ILLMApiAdapter` interface provided in the package `@nullplatform/llm-gateway-sdk`:

```typescript
import { ILLMApiAdapter, ILLMRequest, ILLMResponse, ExtensionMetadata } from '@llm-gateway/sdk';

export interface ILLMApiAdapter<TInput = any, TOutput = any> extends IConfigurableExtension {
    readonly name: string;
    readonly basePaths: Array<string>;
    
    transformInput(input: TInput): Promise<ILLMRequest>;
    transformOutput(processedInput: ILLMRequest, input: TInput, response: ILLMResponse): Promise<TOutput>;
    transformOutputChunk(processedInput: ILLMRequest, input: TInput, chunk: ILLMResponse, 
                        firstChunk: boolean, finalChunk: boolean, accumulated: ILLMResponse): Promise<Buffer>;
    getNativeAdapters?(): Promise<Array<INativeAdapter>>;
}
```

## Creating an Adapter
### 1. Install the sdk package
```bash
npm i --save @llm-gateway/sdk
```

### 2. Basic Adapter Structure

```typescript
import { ILLMApiAdapter, ILLMRequest, ILLMResponse, ExtensionMetadata } from '@llm-gateway/sdk';

// Configuration interface for your adapter
export interface MyAdapterConfig {
    basePaths: string[];
    enableNativeEndpoints?: boolean;
    customSettings?: Record<string, any>;
}

@ExtensionMetadata({
    name: 'my-adapter',
    description: 'Adapter for My LLM Provider API'
})
export class MyAdapter implements ILLMApiAdapter<MyProviderRequest, MyProviderResponse> {
    readonly name = 'my-adapter';
    readonly basePaths: string[];
    private config: MyAdapterConfig;
    
    constructor() {
        this.basePaths = ['/v1/chat/completions', '/chat/completions'];
    }
    
    async configure(config: MyAdapterConfig): Promise<void> {
        this.config = {
            basePaths: ['/v1/chat/completions'],
            enableNativeEndpoints: true,
            ...config
        };
        this.basePaths = this.config.basePaths;
    }
    
    async validateConfig(config: any): Promise<boolean | string> {
        if (!Array.isArray(config.basePaths) || config.basePaths.length === 0) {
            return 'basePaths must be a non-empty array';
        }
        return true;
    }
    
    async transformInput(input: MyProviderRequest): Promise<ILLMRequest> {
        // Transform provider-specific input to standard format
    }
    
    async transformOutput(processedInput: ILLMRequest, input: MyProviderRequest, response: ILLMResponse): Promise<MyProviderResponse> {
        // Transform standard response back to provider format
    }
    
    async transformOutputChunk(processedInput: ILLMRequest, input: MyProviderRequest, chunk: ILLMResponse, 
                              firstChunk: boolean, finalChunk: boolean, accumulated: ILLMResponse): Promise<Buffer> {
        // Handle streaming chunk transformation
    }
}
```

### 2. Input Transformation

Transform the provider's API format to the gateway's internal format:

It's important to mention that some providers expect tools ids, so you should handle them properly in the transformation.

```typescript
async transformInput(input: MyProviderRequest): Promise<ILLMRequest> {
    // Validate required fields
    this.validateInput(input);
    
    // Transform messages format
    const messages = this.transformMessages(input.messages);
    
    // Transform model parameter  
    const model = this.transformModel(input.model);
    
    // Handle tools/functions
    const tools = input.tools ? this.transformTools(input.tools) : undefined;
    
    // Extract provider-specific parameters
    const providerParams = this.extractProviderParams(input);
    
    return {
        model,
        messages,
        tools,
        tool_choice: input.tool_choice,
        max_tokens: input.max_tokens || 4096,
        temperature: input.temperature ?? 0.7,
        top_p: input.top_p ?? 1.0,
        frequency_penalty: input.frequency_penalty ?? 0,
        presence_penalty: input.presence_penalty ?? 0,
        stop: input.stop,
        stream: input.stream ?? false,
        user: input.user,
        metadata: {
            user_id: this.extractUserId(input),
            original_provider: this.name,
            custom: providerParams
        }
    };
}

private validateInput(input: MyProviderRequest): void {
    if (!input.messages || !Array.isArray(input.messages) || input.messages.length === 0) {
        throw new Error('Messages are required and must be a non-empty array');
    }
    
    if (!input.model || typeof input.model !== 'string') {
        throw new Error('Model is required and must be a string');
    }
}

private transformMessages(messages: MyProviderMessage[]): ILLMMessage[] {
    return messages.map(msg => {
        // Handle different message types
        switch (msg.role) {
            case 'user':
                return {
                    role: 'user',
                    content: this.transformContent(msg.content)
                };
            case 'assistant':
                return {
                    role: 'assistant',
                    content: msg.content,
                    tool_calls: msg.tool_calls ? this.transformToolCalls(msg.tool_calls) : undefined
                };
            case 'system':
                return {
                    role: 'system',
                    content: msg.content
                };
            case 'tool':
                return {
                    role: 'tool',
                    content: msg.content,
                    tool_call_id: msg.tool_call_id
                };
            default:
                throw new Error(`Unsupported message role: ${msg.role}`);
        }
    });
}

private transformTools(tools: MyProviderTool[]): ILLMTool[] {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
        }
    }));
}
```

### 3. Output Transformation

Transform the gateway's standard response back to the provider's expected format:

```typescript
async transformOutput(processedInput: ILLMRequest, input: MyProviderRequest, response: ILLMResponse): Promise<MyProviderResponse> {
    return {
        id: response.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: response.created || Math.floor(Date.now() / 1000),
        model: response.model || input.model,
        choices: response.choices?.map((choice, index) => ({
            index,
            message: {
                role: choice.message.role,
                content: choice.message.content,
                tool_calls: choice.message.tool_calls ? 
                    this.transformToolCallsToProvider(choice.message.tool_calls) : undefined
            },
            finish_reason: choice.finish_reason
        })) || [],
        usage: response.usage ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens
        } : undefined,
        // Include provider-specific fields from metadata
        ...this.extractProviderSpecificFields(response)
    };
}

private transformToolCallsToProvider(toolCalls: ILLMToolCall[]): MyProviderToolCall[] {
    return toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: {
            id: tc.function.id, // Very important do a right tool id handling because many providers validates that
            name: tc.function.name,
            arguments: tc.function.arguments
        }
    }));
}

private extractProviderSpecificFields(response: ILLMResponse): Record<string, any> {
    // Extract any provider-specific fields from metadata
    return response.metadata?.custom || {};
}
```

### 4. Streaming Support

Handle streaming responses with proper chunk transformation:

```typescript
async transformOutputChunk(
    processedInput: ILLMRequest, 
    input: MyProviderRequest, 
    chunk: ILLMResponse,
    firstChunk: boolean, 
    finalChunk: boolean, 
    accumulated: ILLMResponse
): Promise<Buffer> {
    
    if (firstChunk) {
        // Send initial chunk with metadata
        const initialChunk = {
            id: chunk.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: chunk.created || Math.floor(Date.now() / 1000),
            model: chunk.model || input.model,
            choices: []
        };
        return Buffer.from(`data: ${JSON.stringify(initialChunk)}\n\n`);
    }
    
    if (finalChunk) {
        // Send final chunk and termination
        const finalChunkData = {
            id: chunk.id,
            object: 'chat.completion.chunk',
            created: chunk.created,
            model: chunk.model,
            choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop'
            }]
        };
        
        return Buffer.from(
            `data: ${JSON.stringify(finalChunkData)}\n\n` +
            `data: [DONE]\n\n`
        );
    }
    
    // Transform regular chunk
    const chunkData = {
        id: chunk.id,
        object: 'chat.completion.chunk',
        created: chunk.created,
        model: chunk.model,
        choices: chunk.choices?.map((choice, index) => ({
            index,
            delta: {
                role: choice.message?.role,
                content: choice.message?.content,
                tool_calls: choice.message?.tool_calls ? 
                    this.transformToolCallsToProvider(choice.message.tool_calls) : undefined
            },
            finish_reason: choice.finish_reason
        })) || []
    };
    
    return Buffer.from(`data: ${JSON.stringify(chunkData)}\n\n`);
}
```

## Advanced Features

### 1. Native Endpoints

Provide provider-specific endpoints (like model listing):

```typescript
async getNativeAdapters(): Promise<Array<INativeAdapter>> {
    if (!this.config.enableNativeEndpoints) {
        return [];
    }
    
    return [{
        name: 'models',
        path: '/models',
        method: 'GET',
        handler: async (context: IRequestContext): Promise<any> => {
            return {
                object: 'list',
                data: await this.getAvailableModels()
            };
        }
    }];
}

private async getAvailableModels(): Promise<any[]> {
    return [
        {
            id: 'my-model-v1',
            object: 'model',
            created: 1640000000,
            owned_by: 'my-provider',
            permission: [],
            root: 'my-model-v1',
            parent: null
        },
        {
            id: 'my-model-v2',
            object: 'model', 
            created: 1650000000,
            owned_by: 'my-provider',
            permission: [],
            root: 'my-model-v2',
            parent: null
        }
    ];
}
```

### 2. Complex Content Handling

Handle various content types (text, images, etc.):

```typescript
private transformContent(content: string | MyProviderContent[]): string | ILLMContent[] {
    if (typeof content === 'string') {
        return content;
    }
    
    // Handle multimodal content
    return content.map(item => {
        switch (item.type) {
            case 'text':
                return {
                    type: 'text',
                    text: item.text
                };
            case 'image':
                return {
                    type: 'image_url',
                    image_url: {
                        url: item.image_url,
                        detail: item.detail || 'auto'
                    }
                };
            default:
                throw new Error(`Unsupported content type: ${item.type}`);
        }
    });
}
```

### 3. Error Handling

Implement comprehensive error handling:

```typescript
async transformInput(input: MyProviderRequest): Promise<ILLMRequest> {
    try {
        this.validateInput(input);
        return await this.performTransformation(input);
    } catch (error) {
        if (error instanceof ValidationError) {
            throw new AdapterError(`Invalid input: ${error.message}`, 400);
        }
        throw new AdapterError(`Transformation failed: ${error.message}`, 500);
    }
}

class AdapterError extends Error {
    constructor(message: string, public statusCode: number) {
        super(message);
        this.name = 'AdapterError';
    }
}
```

### 4. Parameter Mapping

Handle parameter differences between providers:

```typescript
private transformModel(model: string): string {
    // Map provider-specific model names to internal names
    const modelMap = {
        'my-provider-small': 'gpt-3.5-turbo',
        'my-provider-large': 'gpt-4',
        'my-provider-vision': 'gpt-4-vision-preview'
    };
    
    return modelMap[model] || model;
}

private extractProviderParams(input: MyProviderRequest): Record<string, any> {
    // Extract provider-specific parameters
    const providerParams: Record<string, any> = {};
    
    if (input.custom_setting !== undefined) {
        providerParams.custom_setting = input.custom_setting;
    }
    
    if (input.special_mode !== undefined) {
        providerParams.special_mode = input.special_mode;
    }
    
    return providerParams;
}
```

## Adapter Registration


### Configuration

Configure adapters in the gateway configuration. LLM Gateway will automatically discover all adapters when you add your package in the `availableExtensions` section of the gateway configuration file. You can use `path` loader while you are developing for testing purposes, remember to build your ts packages before use them. 
LLM Gateway will look for all your exported classes that implement the `ILLMApiAdapter` interface and register them automatically.

```yaml
# Gateway configuration
adapters:
  - name: my-adapter
    type: my-adapter
    config:
      basePaths: ["/v1/my-api", "/my-api"]
      enableNativeEndpoints: true
      customSettings:
        special_mode: true

# Or load external adapters
availableExtensions:
    - path: "./my-custom-adapter.js"
    - module: "@my-org/llm-adapter"
```

## Best Practices

### 1. Input Validation
- Validate all required fields
- Check parameter ranges and types
- Provide clear error messages
- Handle edge cases gracefully

### 2. Parameter Mapping
- Map provider-specific parameters appropriately
- Preserve custom parameters in metadata
- Use sensible defaults for missing parameters
- Document parameter differences

### 3. Error Handling
- Provide meaningful error messages
- Use appropriate HTTP status codes
- Log transformation errors appropriately
- Handle partial failures in streaming

### 4. Performance
- Keep transformations lightweight
- Cache expensive operations
- Minimize object creation
- Use efficient data structures

### 5. Compatibility
- Follow provider API specifications exactly
- Handle version differences appropriately
- Maintain backward compatibility
- Test with real client libraries

### 6. Security
- Validate and sanitize all inputs
- Don't log sensitive data
- Handle authentication properly
- Validate content types and sizes
