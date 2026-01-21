# Plugin Development Guide

This guide covers how to create custom plugins for the LLM Gateway.

## Plugin Architecture Overview

Plugins in the LLM Gateway follow a lifecycle-based architecture where they can intercept and modify **requests** and **response** at different phases:

- **beforeModel**: Pre-processing before LLM execution
- **afterModel**: Post-processing after LLM execution  
- **afterChunk**: Processing individual streaming chunks
- **onModelError**: Error handling when model execution fails
- **detachedAfterResponse**: Async cleanup operations

## Core Interface

All plugins must implement the `ILLMPlugin` interface, because all methods are optional if you have at least one, the class will be considered a plugin:

```typescript
import { ILLMPlugin, IRequestContext, ILLMPluginResult, ExtensionMetadata } from '@llm-gateway/sdk';

export interface ILLMPlugin extends IConfigurableExtension {
    beforeModel?(context: IRequestContext): Promise<ILLMPluginResult>;
    afterModel?(context: IRequestContext): Promise<ILLMPluginResult>;
    afterChunk?(context: IRequestContext): Promise<ILLMPluginResult>;
    onModelError?(context: IRequestContext): Promise<ILLMPluginResult>;
    detachedAfterResponse?(context: IRequestContext): Promise<void>;
}
```

## Creating a Plugin

### 1. Basic Plugin Structure

```typescript
import { ILLMPlugin, IRequestContext, ILLMPluginResult, ExtensionMetadata } from '@llm-gateway/sdk';

// Configuration interface for your plugin
export interface MyPluginConfig {
    enabled: boolean;
    customSetting: string;
    threshold?: number;
}

@ExtensionMetadata({
    name: 'my-plugin',
    version: '1.0.0',
    description: 'Description of what your plugin does',
    configurationSchema: {
        type: 'object',
        properties: {
            enabled: { type: 'boolean', default: true },
            customSetting: { type: 'string' },
            threshold: { type: 'number', default: 100 }
        },
        required: ['customSetting']
    }
})
export class MyPlugin implements ILLMPlugin {
    private config: MyPluginConfig;
    
    async configure(config: MyPluginConfig): Promise<void> {
        this.config = config;
    }
    
    async validateConfig(config: any): Promise<boolean | string> {
        if (!config.customSetting) {
            return 'customSetting is required';
        }
        return true;
    }
    
    async beforeModel(context: IRequestContext): Promise<ILLMPluginResult> {
        // Your pre-processing logic here
        return { context };
    }
}
```

### 2. Plugin Metadata Decorator

The `@ExtensionMetadata` decorator is required for plugin registration:

```typescript
@ExtensionMetadata({
    name: 'unique-plugin-name',        // Unique identifier, this identifier will be used as "type" in the configuration of plugins
    version: '1.0.0',                  // Semantic version
    description: 'Plugin description', // What the plugin does
    configurationSchema: {             // JSON Schema for configuration
        type: 'object',
        properties: {
            // Define your configuration properties
        }
    }
})
```

### 3. Configuration Management

Implement proper configuration handling:

```typescript
export interface PluginConfig {
    apiKey?: string;
    endpoint?: string;
    timeout?: number;
    retryAttempts?: number;
}

export class MyPlugin implements ILLMPlugin {
    private config: PluginConfig;
    
    async configure(config: PluginConfig): Promise<void> {
        // Set defaults
        this.config = {
            timeout: 5000,
            retryAttempts: 3,
            ...config
        };
        
        // Initialize any clients or resources
        this.initializeClient();
    }
    
    async validateConfig(config: any): Promise<boolean | string> {
        // Validate required fields
        if (config.apiKey && typeof config.apiKey !== 'string') {
            return 'apiKey must be a string';
        }
        
        if (config.timeout && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
            return 'timeout must be a positive number';
        }
        
        return true;
    }
    
    private initializeClient(): void {
        // Initialize HTTP clients, database connections, etc.
    }
}
```

## Plugin Lifecycle Methods

### beforeModel - Pre-processing

Use this phase for request modification, authentication, validation, or routing:

```typescript
async beforeModel(context: IRequestContext): Promise<ILLMPluginResult> {
    // Example: Add authentication headers
    if (!context.headers.authorization) {
        return {
            context,
            status: 401,
            error: 'Authentication required',
            termination: true
        };
    }
    
    // Example: Modify the request
    if (context.request.model === 'premium-model') {
        context.request.max_tokens = Math.min(context.request.max_tokens || 4000, 8000);
    }
    
    // Example: Add custom metadata
    context.pluginData.myPlugin = {
        processedAt: new Date().toISOString(),
        originalModel: context.body.model
    };
    
    return { 
        success: true,
        context    
    };
}
```

### afterModel - Post-processing

Use this phase for response modification, logging, or analytics:

```typescript
async afterModel(context: IRequestContext): Promise<ILLMPluginResult> {
    // Example: Log usage metrics
    const usage = context.response?.usage;
    if (usage) {
        await this.logUsage(context.userId, usage);
    }
    
    // Example: Filter response content
    if (context.response?.choices) {
        context.response.choices = context.response.choices.map(choice => ({
            ...choice,
            message: {
                ...choice.message,
                content: this.filterContent(choice.message.content)
            }
        }));
    }
    
    return {         
        success: true,
        context 
    };
}
```

### afterChunk - Streaming Processing

Handle individual streaming chunks:

In chunk you can also return as part of results `emitChunk: false` this will produce that the gateway buffer and merge the chunks in the following chunk you will receive a marged chunk with all past not flushed chunks plust the new, this behavior simplify the process of analize information across multiple chunks

```typescript
async afterChunk(context: IRequestContext): Promise<ILLMPluginResult> {
    // Access current chunk
    const chunk = context.chunk;
    
    // Example: Content filtering for streaming
    if (chunk.choices?.[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        const filteredContent = this.filterContent(content);
        chunk.choices[0].delta.content = filteredContent;
    }
    
    // Example: Buffer chunks for batch processing
    if (!context.pluginData.myPlugin.chunks) {
        context.pluginData.myPlugin.chunks = [];
    }
    context.pluginData.myPlugin.chunks.push(chunk);
    
    return { context };
}
```

### onModelError - Error Handling

Handle errors during model execution:

```typescript
async onModelError(context: IRequestContext): Promise<ILLMPluginResult> {
    const error = context.error;
    
    // Example: Fallback to different model
    if (error.status === 429) { // Rate limited
        context.body.model = 'fallback-model';
        return {
            context,
            reEvaluateRequest: true // Retry with fallback model
        };
    }
    
    // Example: Custom error logging
    await this.logError(context, error);
    
    // Example: Transform error response
    return {
        context,
        status: 503,
        error: 'Service temporarily unavailable'
    };
}
```

### detachedAfterResponse - Async Cleanup

Perform async operations that don't block the response:

```typescript
async detachedAfterResponse(context: IRequestContext): Promise<void> {
    // Example: Send analytics data
    await this.sendAnalytics(context);
    
    // Example: Clean up temporary resources
    await this.cleanup(context.pluginData.myPlugin);
    
    // Example: Trigger webhooks
    if (context.response?.usage) {
        await this.triggerUsageWebhook(context.userId, context.response.usage);
    }
}
```

## Advanced Features

### Conditional Execution

Configure plugins to run only under specific conditions:

```yaml
plugins:
  - name: my-plugin
    type: my-plugin
    enabled: true
    priority: 500
    conditions:
      paths: ["/v1/chat/completions", "/chat/completions"]
      methods: ["POST"]
      headers:
        "x-api-version": "v2"
      user_ids: ["premium-user-123"]
      models: ["gpt-4", "claude-3"]
    config:
      customSetting: "value"
```

### ILLMPluginResult Interface
```
export interface ILLMPluginResult {
    success: boolean; // Indicates if the plugin execution was successful
    status?: number; // HTTP status code for the response in case of error if ommited will be 500
    context?: IRequestContext; //The context to be used, it will be merged and passed to the following plugin
    error?: Error; //In case of error, the error object to be used in the response
    reevaluateRequest?: boolean; // If it's true, the request will be re-evaluated completely, usefull for plugins that modify the request significantly. For example a plugin that can run some tools
    skipRemaining?: boolean; // Skip remaining plugins in the same phase
    terminate?: boolean; // Terminate the entire request
     /*
    If it's streaming If true, the plugin will emit a chunk to the client.
    skipRemaining true and emitChunk false will finish the plugin execution without emitting the chunk
    This is useful for plugins that buffers the response, for example in guardrails you may need to wait until a \n to analize the content
    */
    emitChunk?: boolean;

}
```

### Plugin Execution Order

#### Overview

Plugins execute in a **sequential, nested pattern** similar to Russian matryoshka dolls. Each plugin wraps around the next, and the **output of one plugin becomes the input of the following plugin**. This creates a chain of transformations where data flows through each plugin in priority order.

#### Priority Rules

- **Lower priority values = Higher execution priority** (closer to the core)
- **beforeModel phase**: Executes in ascending order, each plugin receives and transforms the output from the previous
- **afterModel phase**: Executes in descending order, unwinding the nested calls
- **Data flows through each plugin**, being transformed at each step

#### Example Configuration

Consider three plugins with the following priorities:

| Plugin   | Priority | Description | Position |
|----------|----------|-------------|----------|
| Plugin1  | 10       | Outermost wrapper | First to receive request, last to process response |
| Plugin2  | 20       | Middle wrapper | Receives Plugin1's output |
| Plugin3  | 30       | Innermost wrapper | Closest to model, receives Plugin2's output |


#### Data Flow Example

Let's trace how data flows through the plugins:

##### Input Transformation (beforeModel)
```
Request parsed via adapter
       ↓
Plugin1 beforeModel
       ↓
Plugin2 beforeModel
       ↓
Plugin3 beforeModel
       ↓
Model Execution
```

##### Output Transformation (afterModel)
```
Model outputs
       ↓
Plugin3 afterModel
       ↓
Plugin2 afterModel
       ↓
Plugin1 afterModel
       ↓
Final Response
```

## Plugin Registration and Loading

Configure external plugins via gateway configuration:

```yaml
plugins:
  - name: custom-plugin
    type: custom-plugin
    enabled: true
    priority: 1000
    config:
      setting: value

availableExtensions:
  - path: "./my-custom-plugin.js"  # Local file
  - path: "@my-org/llm-plugin"     # NPM package
```
