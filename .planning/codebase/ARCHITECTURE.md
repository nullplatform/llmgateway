# Architecture

**Analysis Date:** 2026-01-21

## Pattern Overview

**Overall:** Plugin-based Gateway with Registry Pattern

**Key Characteristics:**
- Multi-project support with runtime environments
- Pluggable architecture for providers, adapters, and middleware
- Request transformation pipeline with hook-based execution phases
- Configuration-driven initialization (YAML/JSON)
- Streaming and non-streaming LLM request support

## Layers

**HTTP Layer (Express):**
- Purpose: Handle incoming HTTP requests, security middleware (helmet, CORS), request/response management
- Location: `packages/core/src/gateway.ts` (middleware setup lines 55-87)
- Contains: Express middleware, request handlers, HTTP response serialization
- Depends on: Express, helmet, CORS, uuid
- Used by: Client applications making LLM API calls

**Adapter Layer (Protocol Translation):**
- Purpose: Transform external API formats (OpenAI, Anthropic) to internal format and back
- Location: `packages/core/src/adapters/`
- Contains: OpenAI adapter (`openai.ts`), Anthropic adapter (`antropic.ts`), adapter factory, adapter manager
- Depends on: SDK interfaces (`ILLMApiAdapter`)
- Used by: Gateway server to normalize requests/responses from different provider protocols

**Plugin Pipeline (Middleware):**
- Purpose: Hook-based middleware system for modifying requests, responses, and handling errors
- Location: `packages/core/src/plugins/`
- Contains: Plugin manager (`manager.ts`), plugin factory, bundled plugins (auth, model-router, prompt-manager, regex-hider)
- Depends on: SDK interfaces (`IPlugin`, `IPluginConfig`, `IPluginResult`)
- Used by: Gateway to execute request/response transformations at specific lifecycle phases

**Provider Layer (Model Execution):**
- Purpose: Execute LLM requests against external providers and handle streaming
- Location: `packages/core/src/providers/`
- Contains: Provider registry, OpenAI provider, Anthropic provider implementations
- Depends on: SDK interfaces (`IProvider`), axios for HTTP calls
- Used by: Model registry to execute actual LLM API calls

**Model Registry Layer:**
- Purpose: Maintain model configurations and map model names to provider instances
- Location: `packages/core/src/models/modelRegistry.ts`
- Contains: Model lookup, default model management, provider binding
- Depends on: Provider registry, model configuration
- Used by: Gateway to resolve target models and execute requests

**Configuration Layer:**
- Purpose: Load, validate, and manage gateway configuration
- Location: `packages/core/src/config/`
- Contains: Configuration loader (`loader.ts`), config schema, environment variable replacement
- Depends on: YAML parser, Joi validation
- Used by: Gateway initialization, bootstrapping all subsystems

**Extension Loader:**
- Purpose: Dynamically load external providers, adapters, and plugins from modules or file paths
- Location: `packages/core/src/extensions/extentionsLoader.ts`
- Contains: Module discovery, interface validation, extension registration
- Depends on: SDK interfaces for validation
- Used by: Gateway initialization to support external extensions

## Data Flow

**Non-Streaming Request Flow:**

1. HTTP POST request arrives at `/[project-name]/[adapter]/v1/chat/completions` (line 113 in gateway.ts)
2. Request handler creates `IRequestContext` with request metadata (lines 141-163)
3. Adapter transforms input to standard format via `adapter.transformInput()` (line 170)
4. Plugin pipeline executes `beforeModel()` phase for all enabled plugins (line 177)
   - Plugins can modify context, set target model, or fail the request
   - Sorted by priority (lower first)
   - Can request re-evaluation of entire request flow
5. Model registry resolves target model from context (line 199)
6. Provider executes model call: `model.provider.execute()` (line 428)
7. Response is stored in context (line 431)
8. Plugin pipeline executes `afterModel()` phase in reverse priority order (line 438)
9. Adapter transforms output back to provider format via `adapter.transformOutput()` (line 446)
10. Response sent to client via `res.send()` (line 448)
11. Detached `detachedAfterResponse()` plugin phase fires async (line 451)

**Streaming Request Flow:**

1. Same setup as non-streaming through step 4
2. Provider streams response via `model.provider.executeStreaming()` with callback (line 329)
3. For each chunk received:
   - Chunk is buffered and merged with accumulated response (line 335)
   - Plugin pipeline executes `afterChunk()` phase (line 360)
   - Plugins can emit or buffer chunk
   - Output transformed via `adapter.transformOutputChunk()` (line 388)
   - Chunk written to response stream (line 391)
4. On final chunk, `detachedAfterResponse()` fires async (line 404)

**Error Flow:**

- At any point, if error occurs and is `LLMModelError`, plugin `onModelError()` phase executes (line 224)
- Plugin can request request re-evaluation for retry logic
- Otherwise error caught and passed to Express global error handler (line 476)

**State Management:**

- Request context (`IRequestContext`) flows through entire pipeline
- Context mutated by plugins via `result.context` returns (lines 97-100 in manager.ts)
- Metadata map attached to context for cross-plugin data sharing (line 153)
- Plugin data stored in `context.plugin_data` Map for inter-plugin communication

## Key Abstractions

**IRequestContext:**
- Purpose: Unified request/response representation passed through all processing phases
- Examples: `packages/sdk/src/types/context.ts`
- Pattern: Object containing HTTP request, LLM request, response, context data, metrics

**IPlugin:**
- Purpose: Middleware interface for request/response transformation at specific lifecycle phases
- Examples: `packages/core/src/plugins/bundled/basic-apikey-auth/`, model-router, prompt-manager
- Pattern: Implement hook methods for phase (beforeModel, afterModel, afterChunk, onModelError, detachedAfterResponse)

**ILLMApiAdapter:**
- Purpose: Protocol translator between external API format and internal standard format
- Examples: `packages/core/src/adapters/openai.ts`, `packages/core/src/adapters/antropic.ts`
- Pattern: Implement transformInput, transformOutput, transformOutputChunk methods

**IProvider:**
- Purpose: LLM model executor with streaming support
- Examples: `packages/core/src/providers/openai.ts`, `packages/core/src/providers/anthropic.ts`
- Pattern: Implement execute() for non-streaming, executeStreaming() with callback for streaming

**ProjectRuntime:**
- Purpose: Scoped collection of models, adapters, and plugins for multi-tenant support
- Location: `packages/core/src/gateway.ts` lines 23-31
- Pattern: Object containing name, model registry, adapter manager, plugin manager

## Entry Points

**Server Entry Point:**
- Location: `packages/core/src/index.ts`
- Triggers: `npm run dev` or `npm start`
- Responsibilities: Load environment, initialize GatewayServer, setup signal handlers for graceful shutdown

**CLI Entry Point:**
- Location: `packages/core/src/cli.ts`
- Triggers: `llm-gateway start` command
- Responsibilities: Parse arguments, initialize GatewayServer with config path, setup graceful shutdown

**Gateway Initialization:**
- Location: `packages/core/src/gateway.ts` method `initialize()` (lines 493-550)
- Triggers: Called by `start()` before listening for requests
- Responsibilities: Load config, initialize extensions, bootstrap providers/adapters/plugins, create project runtimes

**HTTP Request Handler:**
- Location: `packages/core/src/gateway.ts` method `handleLLMRequest()` (lines 133-236)
- Triggers: POST request to model endpoint
- Responsibilities: Execute request pipeline with retry logic

## Error Handling

**Strategy:** Multi-layered with plugin interception at model error level

**Patterns:**

- Plugin validation: Joi schema validation in config loader (packages/core/src/config/loader.ts lines 45-48)
- Plugin execution errors: Caught per-plugin, logged, execution halted (lines 112-121 in manager.ts)
- Model execution errors: LLMModelError type detected, `onModelError()` plugin phase executed (line 222 in gateway.ts)
- Retry logic: Max retries configured, request re-evaluated if plugin returns `reevaluateRequest: true` (lines 138-219 in gateway.ts)
- HTTP error handler: Global Express middleware catches unhandled errors, returns 500 with error message (lines 476-490 in gateway.ts)
- Graceful shutdown: SIGTERM/SIGINT handlers call `server.stop()` (lines 22-25 in index.ts)

## Cross-Cutting Concerns

**Logging:**
- Framework: Winston 3.11.0
- Implementation: `packages/core/src/utils/logger.ts`
- Usage: Initialized with log level from config (packages/core/src/gateway.ts line 499)
- Pattern: Passed to all managers, called with context including request_id

**Validation:**
- Framework: Joi 17.11.0
- Approach: Schema-based config validation in ConfigLoader (packages/core/src/config/loader.ts lines 110-199)
- Per-plugin validation: Plugin's `validateConfig()` method called before loading (packages/core/src/plugins/manager.ts lines 66-68)
- Per-adapter validation: Adapter's `validateConfig()` method called before initialization (packages/core/src/adapters/manager.ts lines 32-37)

**Authentication:**
- Approach: Via plugins (bundled basic-apikey-auth plugin)
- Location: `packages/core/src/plugins/bundled/basic-apikey-auth/basicApiKeyAuthPlugin.ts`
- Pattern: Plugin intercepts in `beforeModel()` phase, validates API key, returns error if unauthorized

**Request Tracking:**
- Request ID: Generated or extracted from `x-request-id` header (packages/core/src/gateway.ts line 71)
- Attached to: Response headers, logs, context object
- Usage: Propagated through plugin pipeline for cross-layer request correlation

---

*Architecture analysis: 2026-01-21*
