# Architecture

**Analysis Date:** 2026-01-20

## Pattern Overview

**Overall:** Plugin-based LLM Gateway with configurable adapters, providers, and middleware pipeline

**Key Characteristics:**
- Multi-project support with shared and project-specific configurations
- Plugin-based middleware pipeline with before/after model execution phases
- Adapter factory pattern for API format transformation (OpenAI ↔ Anthropic)
- Provider abstraction for LLM backends
- YAML/JSON configuration with environment variable substitution
- Extensible architecture supporting custom providers, adapters, and plugins

## Layers

**Configuration Layer:**
- Purpose: Load and validate gateway configuration from YAML/JSON files
- Location: `src/config/`
- Contains: `ConfigLoader` (loads/validates config), `GatewayConfig` (type definitions)
- Depends on: Joi validation library, YAML parser
- Used by: `GatewayServer` initialization

**Extension Registry Layer:**
- Purpose: Dynamically load and register plugins, providers, and adapters at runtime
- Location: `src/extensions/extentionsLoader.ts`
- Contains: Extension discovery, metadata extraction, module resolution (local/global)
- Depends on: Extensible interface contracts from SDK
- Used by: Factories for plugins, adapters, providers

**Factory/Registry Layer:**
- Purpose: Create and manage instances of pluggable components
- Location: `src/plugins/factory.ts`, `src/adapters/factory.ts`, `src/providers/providerRegistry.ts`
- Contains: Component registration, instantiation, initialization
- Depends on: Extension loader output, configuration
- Used by: Plugin manager, model registry, adapter manager

**Model & Provider Layer:**
- Purpose: Manage available LLM models and their provider instances
- Location: `src/models/modelRegistry.ts`, `src/providers/`
- Contains: Model registration, provider creation, model-to-provider mapping
- Depends on: Provider registry, provider implementations
- Used by: Request handler for model resolution

**Plugin Manager (Middleware Pipeline):**
- Purpose: Orchestrate plugin execution across request lifecycle phases
- Location: `src/plugins/manager.ts`
- Contains: Plugin loading, conditional execution based on request properties, phase orchestration
- Depends on: Plugin factory, configured plugins
- Used by: Request handler

**Adapter Layer (API Format Translation):**
- Purpose: Transform between different LLM API formats (OpenAI ↔ Anthropic)
- Location: `src/adapters/`
- Contains: Input/output transformation, streaming support, native adapter support
- Depends on: SDK interfaces for request/response types
- Used by: Request handler for format conversion

**HTTP Server Layer:**
- Purpose: Express-based HTTP server with middleware and routing
- Location: `src/gateway.ts`
- Contains: Express app setup, middleware, request routing, error handling
- Depends on: Express, middleware stack
- Used by: Server startup and request dispatch

**Request Handler (Orchestration Layer):**
- Purpose: Coordinate full request lifecycle from input to response
- Location: `src/gateway.ts` - `handleLLMRequest()` method (lines 133-236)
- Contains: Request context creation, plugin execution, adapter transformation, model execution, streaming/non-streaming handling
- Depends on: All other layers
- Used by: Express route handlers

## Data Flow

**Standard (Non-Streaming) Request Flow:**

1. **Input**: HTTP POST to `/{projectName}/{adapter}{basePath}` or `/{adapter}{basePath}` (default project)
2. **Middleware**: Request ID assignment, logging, CORS, body parsing
3. **Plugin Phase - Before Model**:
   - `adapter.transformInput()` - Convert incoming request to standard format
   - Execute `beforeModel` plugins in priority order (lowest priority first)
   - Plugin can: modify context, change target model, skip remaining, or abort with error
   - Allow request re-evaluation if `reevaluateRequest` flag set
4. **Model Resolution**:
   - `modelRegistry.get(targetModel)` - Fetch model and provider
5. **Provider Execution**:
   - `model.provider.execute(standardRequest)` - Call LLM backend
6. **Plugin Phase - After Model**:
   - Execute `afterModel` plugins in reverse order (highest priority first)
   - Can modify response, abort execution
7. **Adapter Transform Output**:
   - `adapter.transformOutput()` - Convert response back to adapter format
8. **Response**: Send HTTP response
9. **Plugin Phase - Detached After Response**:
   - Fire-and-forget `detachedAfterResponse` plugins (don't wait for completion)

**Streaming Request Flow:**

1. Steps 1-4: Same as standard flow
2. **Streaming Provider Execution**:
   - `model.provider.executeStreaming()` initiates stream with `onData` callback
3. **Per-Chunk Processing** (in `onData` callback):
   - Merge chunks into accumulated response
   - Execute `afterChunk` plugins in reverse order
   - Control chunk emission via plugin result (`emitChunk` flag)
   - Write transformed chunk to HTTP response
   - Track state: buffered chunks, first chunk emitted
4. **Final Chunk**:
   - Calculate metrics (tokens, duration)
   - Execute detached after-response plugins
   - Close HTTP response stream

**Error Handling Flow:**

- Catch errors during plugin execution or model call
- If `LLMModelError` raised, execute `onModelError` plugins
- Plugin can return `reevaluateRequest=true` to retry entire flow
- Return error response with request ID for tracking

**State Management:**

- **Request Context** (`IRequestContext`): Passed through entire lifecycle
  - Contains: request body, headers, plugin_data map, metrics, target model, response
  - Modified by: plugins, adapters, model execution
- **Plugin Data Map**: Plugin-to-plugin communication channel
- **Metrics**: Accumulated timing data (start_time, duration_ms, input/output tokens)
- **Retry Loop**: Max retries configurable, allows plugins to trigger re-evaluation

## Key Abstractions

**ILLMApiAdapter:**
- Purpose: Translate between specific LLM API format and internal standard format
- Location: `src/adapters/openai.ts`, `src/adapters/antropic.ts`
- Pattern: Implements `transformInput()`, `transformOutput()`, `transformOutputChunk()`, `getNativeAdapters()`
- Built-in adapters: OpenAI (handles OpenAI format), Anthropic

**IProvider:**
- Purpose: Interface to LLM backend (OpenAI, Anthropic, custom)
- Location: `src/providers/openai.ts`, `src/providers/anthropic.ts`
- Pattern: Implements `execute()` and `executeStreaming()` methods
- Configuration via `configure()` method with API keys, endpoints

**IPlugin:**
- Purpose: Middleware component for request/response transformation
- Location: `src/plugins/bundled/`
- Pattern: Implements lifecycle methods: `beforeModel()`, `afterModel()`, `afterChunk()`, `onModelError()`, `detachedAfterResponse()`
- Conditional execution via plugin config `conditions` (paths, methods, headers, user_ids, models)
- Built-in plugins: BasicApiKeyAuth, ModelRouter, PromtManager, RegexHider

**IModel:**
- Purpose: Represents a configurable LLM model with provider binding
- Contains: model name, provider instance, metadata, is-default flag

**ProjectRuntime:**
- Purpose: Runtime container for a project's configuration and component instances
- Location: `src/gateway.ts` line 23
- Contains: models, plugin manager, adapter manager, model registry
- Allows: Multi-project isolation with shared global adapters/providers

## Entry Points

**Main Server (`src/index.ts`):**
- Location: `src/index.ts` lines 12-47
- Triggers: Called via `npm start` or programmatic import
- Responsibilities:
  - Load environment variables
  - Create `GatewayServer` instance with config path
  - Start server
  - Handle graceful shutdown (SIGTERM, SIGINT)
  - Catch unhandled errors

**CLI Entry (`src/cli.ts`):**
- Location: `src/cli.ts`
- Triggers: Called via `llm-gateway` CLI command (defined in package.json bin field)
- Responsibilities:
  - Parse CLI arguments via Commander.js
  - Support `start` command with `-c/--config` option for config file path
  - Support `config` command to generate example configuration

**Server Initialization (`GatewayServer.start()`):**
- Location: `src/gateway.ts` lines 552-569
- Triggers: Called from main or CLI
- Responsibilities:
  - Call `initialize()` to load extensions, registries, plugins
  - Set up middleware (security, CORS, logging, request ID)
  - Set up routes (health check, LLM endpoints)
  - Start Express listener on configured port

**Request Entry (`handleLLMRequest()`):**
- Location: `src/gateway.ts` lines 133-236
- Triggers: Matched HTTP POST to configured adapter paths
- Responsibilities: Orchestrate entire request lifecycle (see Data Flow)

## Error Handling

**Strategy:** Layered error handling with context preservation and plugin-based recovery

**Patterns:**

1. **Plugin Execution Errors** (lines 112-121 in manager.ts):
   - Caught within plugin loop
   - Plugin name attached to error
   - `success: false` flag returned to caller
   - Execution chain terminates (remaining plugins skipped)
   - Request continues with error response to client

2. **Model Execution Errors** (lines 221-231 in gateway.ts):
   - Caught separately as `LLMModelError`
   - Context passed to `onModelError` plugins for recovery
   - Plugin can retry entire request (`reevaluateRequest`)
   - Falls through to global handler if unrecovered

3. **Global Error Handler** (lines 476-490 in gateway.ts):
   - Catches all uncaught errors
   - Logs with request ID for correlation
   - Returns 500 with generic error message

4. **Graceful Shutdown**:
   - SIGTERM/SIGINT listeners stop server cleanly
   - Uncaught exceptions logged then exit with status 1

## Cross-Cutting Concerns

**Logging:** Winston logger instance created per component with configurable level (debug/info/warn/error)
- Configuration: `src/config/gatewayConfig.ts` line 61-66
- Usage: Every significant operation logged with context (request_id, model, duration_ms, token counts)

**Validation:** Joi schema validation applied to configuration at load time
- Configuration schema: `src/config/loader.ts` lines 110-199
- Plugin/adapter config validation: called before use
- Provider config validation: called during model initialization

**Authentication:** Delegated to plugin system
- Built-in: BasicApiKeyAuth plugin (`src/plugins/bundled/basic-apikey-auth/`)
- Plugin runs in `beforeModel` phase, can abort request

**Metrics:** Captured in request context throughout flow
- Timing: start_time, end_time, duration_ms
- Tokens: input_tokens, output_tokens, total_tokens
- Attached to final log entry and available to plugins
