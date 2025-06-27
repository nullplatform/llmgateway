# LLM Gateway

A high-performance, extensible gateway for Large Language Model (LLM) APIs that provides unified access to multiple AI providers with advanced features like request routing, authentication, monitoring and tracing.

The gateway is designed over the idea of to be completely extensible, allowing you to add plugins for authentication, request validation, response processing, model routing, guardrails and more. 
It supports both synchronous and streaming requests, making it suitable for a wide range of applications.

## 🚀 What is LLM Gateway?
LLM Gateway is a proxy server that sits between your applications and various LLM providers (OpenAI, Anthropic, etc.), offering:



![LLM Gateway Architecture](./docs/images/architecture.png)

- **API Agnostic**: Supports multiple LLM providers APIs making it work without changing your existing codebase or tooling
- **Model Routing**: Intelligent routing with fallback support, you can change the **model** and the **provider** without changing your application code
- **Plugin System**: Extensible architecture for custom functionality
- **Monitoring**: Request tracking, metrics, and observability
- **Multi-Project Support**: Isolated configurations for different use cases
- **Streaming Support**: Real-time response streaming
- **Error Handling**: Automatic retries and graceful error management

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn

## 🛠️ Quick Start

### 1. Create a Configuration File

Create a `gateway.yaml` file:

```yaml
server:
  host: "0.0.0.0"
  port: 3000

models:
  - name: gpt-std
    isDefault: true
    provider:
      type: "openai"
      config:
        apiKey: "${OPENAI_API_KEY}"
        model: "gpt-4.1"
        
  - name: gpt-mini
    provider:
      type: "openai"
      config:
        apiKey: "${OPENAI_API_KEY}"
        model: "gpt-4.1-mini"

projects:
  - name: test
    description: "Test project"
    plugins:
      - name: "router"
        type: "model-router"
        config:
          model: "gpt-std"
          fallbacks:
            - "gpt-mini"
```

### 2. Set Environment Variables

```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### 3. Start the Gateway

```bash
# Using the CLI
npx @nullplatform/llm-gateway start --config gateway.yaml

```

### 4. Test the Gateway

```bash
curl -X POST http://localhost:3000/test/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer nothing" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ],
    "max_tokens": 100
  }'
```

### 5. Response

```
{"id":"chatcmpl-BhgJIGb9nYnVsL7nvD9n45unJmbw0","type":"message","role":"assistant","content":[{"type":"text","text":"Hello! How can I assist you today?"}],"model":"gpt-4.1-mini-2025-04-14","stop_reason":"end_turn","usage":{"input_tokens":11,"output_tokens":9}}
```

As you can see, the request was routed to the `gpt-std` model, and if it fails, it will automatically fallback to `gpt-mini` even when we are talking to the anthropic API and the answer is anthropic api compatible.


## 🔌 Bundled Plugins

The gateway comes with several built-in plugins:

### Basic API Key Authentication

Validates API keys for incoming requests.

```yaml
plugins:
  - name: auth
    type: basic-apikey-auth
    config:
      apikeys:
        - "your-api-key-1"
        - "your-api-key-2"
```

**Options:**
- `apikeys` (array): List of valid API keys

When you send a request, you must include the API key in the `Authorization` header as `Bearer your-api-key-1` or `x-api-key` header `x-api-key: your-api-key-1`.



### Model Router

Routes requests to specific models with fallback support.

```yaml
plugins:
  - name: router
    type: model-router
    config:
      model: "gpt"
      fallbacks:
        - "claude"
        - "gpt-fallback"
```

**Options:**
- `model` (string): Primary model to route to
- `fallbacks` (array): List of fallback models if primary fails

### Regex Hider (PII Protection)

Detects and redacts sensitive information using regex patterns.

```yaml
plugins:
  - name: pii-protection
    type: regex-hider
    config:
      patterns:
        - pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b"
          replacement: "[REDACTED|SSN]"
        - pattern: "\\b(?:\\d{4}[- ]?){3}\\d{4}\\b"
          replacement: "[REDACTED|CREDIT_CARD]"
        - pattern: "[a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z0-9.]+"
          replacement: "[REDACTED|EMAIL]"
          applyTo: "response"
```

**Options:**
- `patterns` (array): List of regex patterns to match and replace
  - `pattern` (string): Regular expression pattern
  - `replacement` (string): Replacement text
  - `applyTo` (string): Apply to "request" or "response" or "both" (default: both)

### Prompt Manager

Manages and injects prompts with different injection modes and A/B testing support.

```yaml
plugins:
  - name: prompt-manager
    type: prompt-manager
    config:
      prompt: "You are a helpful AI assistant. Always respond in a professional manner."
      mode: "override"
      experiment:
        prompt: "You are an enthusiastic AI assistant. Use emojis and be friendly!"
        percentage: 25
```

**Options:**
- `prompt` (string, required): The prompt to inject into system messages
- `mode` (string): Injection mode - one of:
    - `override` (default): Completely replaces existing system prompt
    - `before`: Prepends the prompt to existing system prompt
    - `after`: Appends the prompt to existing system prompt
    - `wrapper`: Uses `${PROMPT}` placeholder to inject existing prompt within template
- `experiment` (object, optional): A/B testing configuration
    - `prompt` (string, required): Alternative prompt for experimentation
    - `percentage` (number, required): Percentage (0-100) of requests using experimental prompt

**Injection Modes Examples:**

```yaml
# Override mode - replaces existing system prompt completely
- name: prompt-override
  type: prompt-manager
  config:
    prompt: "You are a customer service assistant."
    mode: "override"

# Before mode - prepends to existing prompt
- name: prompt-before
  type: prompt-manager-router
  config:
    prompt: "IMPORTANT: Follow all safety guidelines."
    mode: "before"

# After mode - appends to existing prompt
- name: prompt-after
  type: prompt-manager
  config:
    prompt: "Always end responses with: 'Is there anything else I can help you with?'"
    mode: "after"

# Wrapper mode - inject existing prompt into template
- name: prompt-wrapper
  type: prompt-manager
  config:
    prompt: "Context: You are in debugging mode.\n\n${PROMPT}\n\nRemember to be extra careful with your responses."
    mode: "wrapper"
```

***Note: You can have many prompt manager plugins in the same project, they will be applied in priority order, metadata will only contain the first applied***

**A/B Testing Example:**

```yaml
# 30% of requests will use the experimental prompt
plugins:
  - name: prompt-experiment
    type: prompt-manager
    config:
      prompt: "You are a professional AI assistant."
      mode: "override"
      experiment:
        prompt: "You are a creative and innovative AI assistant who thinks outside the box."
        percentage: 30
```

**Metadata Injection:**

The plugin automatically adds metadata to track prompt usage:

```json
{
  "prompt_manager": {
    "used_prompt": "Final system prompt sent to model",
    "original_prompt": "Original system prompt from request",
    "injected_prompt": "Prompt injected by plugin",
    "injection_mode": "override",
    "is_experiment": false,
    "experiment_percentage": 25
  }
}
```

This metadata is useful for:
- Analytics and monitoring prompt performance
- A/B testing analysis
- Debugging prompt injection issues
- Tracking which prompts are being used in production

## Known Plugins

### Langsmith Tracer

[Langsmith Tracer](https://github.com/llmgatewayai/langsmith-tracer) a comprehensive tracing plugin that sends conversation data to [LangSmith](https://smith.langchain.com) for observability, debugging, and performance monitoring.

#### Install

```bash
npm i -g @llmgatewayai/langsmith-tracer 
```

#### Basic Configuration

```yaml

availableExtensions:
  - module: "@llmgatewayai/langsmith-tracer"
    
plugins:
  - name: langsmith-tracer-default
    type: langsmith-tracer
    config:
      apiKey: "${LANGSMITH_API_KEY}"
      projectName: "my-llm-gateway"
```



### ClickHouse Tracer

[ClickHouse Tracer](https://github.com/nullplatform/llmgateway/tree/main/packages/plugins/clickhouse-tracer) enables tracing and monitoring of LLM requests using ClickHouse as the backend for storing traces.

#### Install using npm:

```
npm install -g @nullplatform/llm-gateway-clickhouse-tracer-plugin
```

```yaml
availableExtensions:
  - module: "@nullplatform/llm-gateway-clickhouse-tracer-plugin"
    
plugins:
  - name: tracer
    type: clickhouse-tracer
    config:
      clickhouse:
        url: "http://localhost:8123"
        username: "default"
        password: ""
        database: "traces"
      flushInterval: 10000
```

**Options:**
- `clickhouse`: ClickHouse connection configuration
- `url` (string): ClickHouse server URL
  - `username` (string): ClickHouse username
  - `password` (string): ClickHouse password
  - `database` (string): ClickHouse database name
  - `table` (string): ClickHouse table name (default: `traces`) If table does not exist, it will be created automatically
- `flushInterval` (number): Batch flush interval in milliseconds

## 🛠️ Creating Custom Plugins

### Plugin Interface

A plugin implements the `IPlugin` interface with lifecycle hooks:

```typescript
import { IPlugin, IRequestContext, IPluginResult, PluginMetadata } from '@nullplatform/llm-gateway-sdk';

@PluginMetadata({
    name: 'my-custom-plugin',
    version: '1.0.0',
    description: 'My custom plugin description',
    configurationSchema: {
        // JSON Schema for configuration validation
        type: 'object',
        properties: {
            enabled: { type: 'boolean' }
        }
    }
})
export class MyCustomPlugin implements IPlugin {
    private config: any;

    async configure(config: any): Promise<void> {
        this.config = config;
    }

    async validateConfig(config: any): Promise<boolean | string> {
        // Return true if valid, or error message string if invalid
        return true;
    }

    async beforeModel(context: IRequestContext): Promise<IPluginResult> {
        // Execute before sending request to LLM
        return { success: true };
    }

    async afterModel(context: IRequestContext): Promise<IPluginResult> {
        // Execute after receiving response from LLM
        return { success: true };
    }

    async afterChunk(context: IRequestContext): Promise<IPluginResult> {
        // Execute after each streaming chunk (streaming only)
        return { success: true };
    }

    async onModelError(context: IRequestContext): Promise<IPluginResult> {
        // Execute when LLM request fails
        return { success: true };
    }

    async detachedAfterResponse(context: IRequestContext): Promise<void> {
        // Execute asynchronously after response is sent (for logging, etc.)
    }
}
```

### Request Lifecycle<div style="text-align: center;">

<div style="text-align: center;">
 <img src="./docs/images/lifecycle.png" alt="LLM Gateway Request Life Cycle" width="300" height="500">
</div>
1. **adapterHandleRequest**: When communication is initiated the adapter handle the request and transform it into a request context object (`IRequestContext`).

2. **beforeModel**: Executed before sending request to LLM provider in all pluguins sequentially
   - Authentication, request validation, request modification
   - Can modify context, terminate request, or trigger re-evaluation

3. **modelExecute**: Executed when the request is sent to the LLM provider
   - This is where the actual LLM API call happens, and it can be handled by the adapter

4. **afterModel**: Executed in all plugins sequentially after receiving response from LLM (non-streaming) 
   - Response processing, filtering, transformation
   - Can modify response before sending to client

5 **afterChunk**: Executed after each streaming chunk (streaming only) in all plugins sequentially
   - Real-time response processing
   - Can buffer, modify, or filter chunks

4. **onModelError**: Executed in all plugins sequentially when LLM request fails
   - Error handling, fallback logic
   - Can trigger request re-evaluation with different parameters

5. **detachedAfterResponse**: Executed asynchronously after response is sent in all plugins
   - Logging, analytics, cleanup tasks
   - Does not affect response timing

### Plugin Result Properties

- `success` (boolean): Whether the plugin executed successfully
- `context` (IRequestContext): Modified request context, all plugins share the same context object and all results will be merged (**use with caution**)
- `error` (Error): Error object if plugin failed
- `status` (number): HTTP status code for error responses
- `reevaluateRequest` (boolean): Re-evaluate the entire request (useful for retries, tool execution, etc.)
- `skipRemaining` (boolean): Skip remaining plugins in this phase
- `terminate` (boolean): Terminate the entire request
- `emitChunk` (boolean): Whether to emit chunk in streaming mode, if it's false, gateway will buffer and merge chunks until true

### Request Context

The `IRequestContext` object contains:

```typescript
interface IRequestContext {
    project: string;
    adapter: string;
    request_id: string;
    request: ILLMRequest;
    response?: ILLMResponse;
    available_models: string[];
    target_model?: string;
    target_model_provider?: string;
    httpRequest: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body: any;
    };
    headers: Record<string, string>;
    query_params: Record<string, string>;
    client_ip?: string;
    user_agent?: string;
    metadata: Record<string, any>;
    plugin_data: Map<string, any>;
    metrics: {
        start_time: Date;
        end_time?: Date;
        duration_ms?: number;
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
    };
    error?: Error;
    retry_count: number;
    // Streaming-specific
    chunk?: ILLMResponse;
    bufferedChunk?: ILLMResponse;
    finalChunk?: boolean;
    accumulated_response?: ILLMResponse;
}
```

### Plugin Registration

1. **External Plugin**: Install as npm package and reference in config
```yaml
availableExtensions:
  - module: "@my-org/my-plugin"
```

2. **Local Plugin**: Build and reference local file
```yaml
availableExtensions:
  - path: "./plugins/my-plugin/dist/index.js"
```
## 📖 Advanced Configuration

### Multi-Project Setup

Projects configuration inherits from the default project configuration, allowing you to define specific models, plugins, and settings for each project.

```yaml
# Default project configuration
defaultProject: true

models:
  - name: gpt
    isDefault: true
    provider:
      type: openai
      config:
        apiKey: "${OPENAI_API_KEY}"

plugins:
  - name: logger
    type: logger

# Project-specific configurations
projects:
  - name: "production"
    description: "Production environment"
    models:
      - name: claude-prod
        provider:
          type: anthropic
          config:
            apiKey: "${ANTHROPIC_PROD_KEY}"
    plugins:
      - name: auth
        type: basic-apikey-auth
        config:
          apikeys: ["prod-key-123"]
      
  - name: "development"
    description: "Development environment"
    plugins:
      - name: dev-logger
        type: logger
        config:
          level: debug
```


### Monitoring & Health Checks

```yaml
monitoring:
  enabled: true
  health_check:
    endpoint: "/health"

logging:
  level: "info"
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License.

## Known missing
- [ ] Plugin configuration validation using JSON Schema



## 🆘 Support

- 🐛 [Issue Tracker](https://github.com/nullplatform/llm-gateway/issues)
- 📧 [Go deeper](mailto:gabriel@nullplatform.io)