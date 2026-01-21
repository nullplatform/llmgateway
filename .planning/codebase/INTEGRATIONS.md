# External Integrations

**Analysis Date:** 2026-01-21

## APIs & External Services

**Language Model Providers:**
- OpenAI API - Chat completions, function calling, streaming
  - SDK/Client: axios (HTTP client)
  - Auth: `OPENAI_API_KEY` environment variable
  - Base URL: `https://api.openai.com/v1` (configurable)
  - Endpoint: `/chat/completions` (streaming and non-streaming)
  - Implementation: `packages/core/src/providers/openai.ts`

- Anthropic Claude API - Chat completions, tool use, streaming
  - SDK/Client: axios (HTTP client)
  - Auth: `ANTHROPIC_API_KEY` environment variable via `x-api-key` header
  - Base URL: `https://api.anthropic.com` (configurable)
  - Endpoint: `/v1/messages`
  - Implementation: `packages/core/src/providers/anthropic.ts`

- Ollama - Local LLM inference (extensible via adapter pattern)
  - Support configured via adapter registry
  - Implementation: `packages/core/src/adapters/` (factory-based pattern)

## Data Storage

**Databases:**
- ClickHouse (optional, for conversation tracing)
  - Client libraries: `@clickhouse/client` 1.11.2 and `clickhouse` 2.6.0
  - Connection: Host/username/password via YAML config
  - Configuration location: `gateway.example.yaml` lines 98-102
  - Use case: Stores conversation traces and request metadata
  - Flush interval: Configurable (default 1000ms)
  - Plugin: `@nullplatform/llm-gateway-clickhouse-tracer-plugin` (external)

**File Storage:**
- Local filesystem only
- Logs written to: `logs/error.log`, `logs/combined.log` (production only)
- Log file path: `process.env.NODE_ENV === 'production'` triggers file transport

**Caching:**
- None - Requests passed through to providers without caching layer

## Authentication & Identity

**Auth Provider:**
- Custom implementation (plugin-based)
- Basic API Key authentication via `basic-apikey-auth` plugin
- Implementation: `packages/core/src/plugins/bundled/basic-apikey-auth/basicApiKeyAuthPlugin.ts`
- Configuration schema: Accepts array of API keys for validation
- Plugin execution phase: Pre-request validation

**Provider Authentication:**
- OpenAI: Bearer token in Authorization header (`Bearer ${apiKey}`)
- Anthropic: Custom header `x-api-key: ${apiKey}`
- Both providers: Credentials configured per model in YAML

## Monitoring & Observability

**Error Tracking:**
- Winston logger (structured JSON logging)
- Console transport (always active)
- File transport (production only): `logs/error.log`, `logs/combined.log`
- Implementation: `packages/core/src/utils/logger.ts`

**Logs:**
- Format: JSON with timestamps and stack traces
- Redaction: API keys and sensitive headers redacted in logs
- Levels: debug, info, warn, error
- Destinations: Console (all) + File (production)
- Metadata: request_id, provider, model, token counts, duration_ms

**Health Check:**
- Endpoint: `/health` (configurable via config)
- Response: Status, timestamp, version
- Implementation: `packages/core/src/gateway.ts` (line 92)
- Configuration: `monitoring.health_check.endpoint` in YAML

**Tracing:**
- Optional ClickHouse integration for request/response tracing
- Plugin configuration: `gateway.example.yaml` lines 94-103
- Stores: HTTP requests, LLM provider calls, plugin executions

## CI/CD & Deployment

**Hosting:**
- Platform-agnostic (runs on any Node.js >=18.0.0 environment)
- Docker-ready (no Dockerfile in repo, add custom)
- CLI entrypoint: `llm-gateway start -c <config-path>`

**CI Pipeline:**
- Not detected in current codebase
- Test commands available: `npm test`, `npm run test:watch`, `npm run test:coverage`

## Environment Configuration

**Required env vars:**
- `OPENAI_API_KEY` - OpenAI API authentication
- `ANTHROPIC_API_KEY` - Anthropic Claude API authentication
- `PORT` - Server listening port (default: 3000)

**Optional env vars:**
- `NODE_ENV` - Set to 'production' for file logging
- `npm_package_version` - Populated by npm (used in health check response)

**Secrets location:**
- Via YAML substitution: `${ENVIRONMENT_VARIABLE_NAME}`
- Via `.env` file (loaded by dotenv)
- Location: `packages/core/src/index.ts` line 8: `dotenv.config()`

**Configuration location:**
- YAML file path: Passed as CLI argument `-c` or `--config`
- Example: `packages/core/src/cli.ts` lines 20-21
- Default example: `config/gateway.example.yaml`

## Webhooks & Callbacks

**Incoming:**
- No incoming webhooks detected
- Request-driven only (synchronous HTTP)

**Outgoing:**
- Streaming callbacks via `IChunkEmitter` interface (internal)
- No external webhook callbacks to third-party services

## Request Flow & Routing

**LLM Request Path:**
1. Client HTTP POST to `/models/:modelName/chat/completions`
2. Plugin pipeline execution (validation, transformation, logging)
3. Model registry lookup → Provider selection
4. Provider HTTP request (OpenAI or Anthropic API)
5. Response transformation (normalize to internal ILLMResponse format)
6. Plugin response phase
7. Client response (streaming or non-streaming)

**Plugin System:**
- Pluginable architecture via `PluginManager` (`packages/core/src/plugins/manager.ts`)
- Bundled plugins:
  - `basic-apikey-auth`: API key validation
  - `regex-hider`: PII detection and redaction
  - `model-router`: Model fallback routing
  - `prompt-manager`: Prompt wrapping/injection
- Extension loader: `packages/core/src/extensions/extentionsLoader.ts`

**Adapter Pattern:**
- LLM API adapters for different providers
- OpenAI adapter: `packages/core/src/adapters/openai.ts`
- Anthropic adapter: `packages/core/src/adapters/antropic.ts`
- Factory pattern: `packages/core/src/adapters/factory.ts`
- Manager: `packages/core/src/adapters/manager.ts`

## Error Handling & Retry

**Provider Retry Logic:**
- Exponential backoff: delay × 2^(attempt-1)
- Configurable retry attempts per provider
- OpenAI default: 3 retries, 1000ms initial delay
- Anthropic default: 3 retries, 1000ms initial delay
- 4xx errors not retried (client errors)
- Implemented in: `packages/core/src/providers/openai.ts` (line 278) and `anthropic.ts` (line 473)

**Error Transformation:**
- Provider-specific errors mapped to common format
- Status codes, error types, and messages preserved
- Implementation: Error interceptors in axios clients

---

*Integration audit: 2026-01-21*
