# External Integrations

**Analysis Date:** 2026-01-20

## APIs & External Services

**Large Language Model Providers:**

**OpenAI:**
- What it's used for: Chat completion requests (gpt-4, gpt-3.5-turbo, etc.)
- SDK/Client: axios (custom HTTP client)
- Auth: Bearer token via `Authorization` header
- Env var: `OPENAI_API_KEY`
- Endpoint: `https://api.openai.com/v1` (configurable via `baseUrl`)
- Base paths: `/v1/chat/completions`, `/chat/completions`
- Features: Streaming, function calling, tool use
- Implementation: `src/providers/openai.ts`
- Adapter: `src/adapters/openai.ts`
- Retry: Exponential backoff with configurable attempts (default: 3)
- Retry delay: 1000ms base (default)

**Anthropic:**
- What it's used for: Chat completion requests (Claude models)
- SDK/Client: axios (custom HTTP client)
- Auth: API key via `x-api-key` header
- Env var: `ANTHROPIC_API_KEY`
- Endpoint: `https://api.anthropic.com` (configurable via `baseUrl`)
- API version: Configurable (default: 2023-06-01) via `anthropic-version` header
- Base path: `/v1/messages`
- Features: Streaming, function calling, tool use
- Implementation: `src/providers/anthropic.ts`
- Adapter: `src/adapters/anthropic.ts`
- Retry: Exponential backoff with configurable attempts (default: 3)
- Max tokens: Configurable default (4096)

## Data Storage

**Databases:**

**ClickHouse (Optional):**
- Type: Time-series analytics database
- Purpose: Store conversation traces, analytics, and request metrics
- Client: `@clickhouse/client` 1.11.2 (official) or `clickhouse` 2.6.0
- Connection: Configured via environment or config file
- Auth: Username and password
- Example config location: `config/gateway.example.yaml` (lines 94-103)
- Configuration fields:
  - `clickhouse.host`: ClickHouse server hostname
  - `clickhouse.username`: Database username
  - `clickhouse.password`: Database password
  - `clickhouse.database`: Database name (default: "traces")
  - `flushInterval`: Batch write interval in ms (default: 1000)
- Plugin: ClickHouse tracer plugin (via `@nullplatform/llm-gateway-clickhouse-tracer-plugin` module)
- Data: Stores conversation messages, metadata, token usage, request latency

**File Storage:**
- Type: Local filesystem
- Purpose: Logging only
- Location: Configurable via `logging.file_path` (default: `./logs/gateway.log`)
- When used: Production environment (NODE_ENV=production)
- Format: JSON or simple text (configurable)
- Files created:
  - `logs/error.log` - Error level logs only
  - `logs/combined.log` - All log levels

**Caching:**
- Type: None configured
- In-memory: Request context passed through plugin chain (ephemeral)

## Authentication & Identity

**LLM Provider Authentication:**
- OpenAI: Bearer token authentication
  - Header: `Authorization: Bearer ${OPENAI_API_KEY}`
  - Passed to: `src/providers/openai.ts`
  - Implementation: `src/providers/openai.ts:34-56`

- Anthropic: API key authentication
  - Header: `x-api-key: ${ANTHROPIC_API_KEY}`
  - Passed to: `src/providers/anthropic.ts`
  - Implementation: `src/providers/anthropic.ts:80-104`

**Gateway Authentication:**
- Plugin: Basic API Key Auth (`src/plugins/bundled/basic-apikey-auth/basicApiKeyAuthPlugin.ts`)
- Usage: Optional, can be configured in plugins list
- Configuration: Accepts list of valid API keys
- Execution phase: Before model execution
- Can reject requests with 401 status

**Request Headers Forwarding:**
- All incoming headers forwarded to plugins
- Plugins can inspect/modify headers
- Headers available in context: `IRequestContext.headers`

## Monitoring & Observability

**Error Tracking:**
- Type: Built-in logging (no external service)
- Framework: winston 3.11.0
- Implementation: `src/utils/logger.ts`

**Logs:**
- Type: Local logging to console and optional files
- Framework: winston with JSON or simple formatting
- Destinations: Console (always), File (production only)
- Log levels: debug, info, warn, error
- Context included: request_id, model, provider, duration_ms, token usage

**Request Tracing:**
- Type: Request ID correlation
- Implementation: UUID generated per request (header `x-request-id`)
- Passed through: All logs and responses
- Accessible in: Response headers and context

**Analytics (Optional):**
- ClickHouse tracer plugin for detailed metrics
- Tracks: Request latency, token usage, model selection, errors
- Batched writes: Configurable flush interval (default: 1000ms)
- Configuration: `config/gateway.example.yaml` lines 94-103

**Monitoring Configuration:**
- Health check endpoint: `/health` (configurable)
- Response format: JSON with status, timestamp, version
- Implementation: `src/gateway.ts:92-98`
- Metrics available: requests, latency, errors, tokens, costs (configurable)

## CI/CD & Deployment

**Hosting:**
- Target: Any Node.js 18+ environment
- Deployment methods: Docker, direct Node.js, serverless (with modifications)

**CI Pipeline:**
- GitHub Actions workflow: `.github/workflows/test.yml`
- Triggers: Push to main, pull requests
- Run Commands:
  ```bash
  npm run test                # Run Jest tests
  npm run test:ci             # CI mode: coverage + no watch
  npm run build               # Compile TypeScript
  npm run lint                # Run ESLint on packages/*/src/**/*.ts
  ```

**Monorepo Publishing:**
- npm publish commands in root `package.json`:
  - `npm run publish:sdk` - Publish @nullplatform/llm-gateway-sdk
  - `npm run publish:core` - Publish @nullplatform/llm-gateway

## Environment Configuration

**Required environment variables:**
- `OPENAI_API_KEY` - OpenAI API key (required if using OpenAI provider)
- `ANTHROPIC_API_KEY` - Anthropic API key (required if using Anthropic provider)
- `NODE_ENV` - Set to "production" to enable file logging

**Optional environment variables:**
- `PORT` - Server port (default: 3000)
- ClickHouse credentials (if using ClickHouse tracer plugin):
  - `CLICKHOUSE_HOST`
  - `CLICKHOUSE_USERNAME`
  - `CLICKHOUSE_PASSWORD`
  - `CLICKHOUSE_DATABASE`

**Configuration file:**
- Path specified via CLI: `llm-gateway start --config <path>`
- Format: YAML or JSON
- Supports environment variable interpolation: `${VARIABLE_NAME}`
- Example: `config/gateway.example.yaml`

**Secrets location:**
- Environment variables loaded from `.env` file (gitignore'd)
- Or system environment
- API keys passed at runtime to provider instances
- Never logged in plain text (redacted as `[REDACTED]` in logs)

## Webhooks & Callbacks

**Incoming:**
- POST endpoints configured per adapter:
  - OpenAI adapter: `/openai/v1/chat/completions`, `/openai/chat/completions`
  - Anthropic adapter: `/anthropic/v1/messages` (via model router)
- Project-based routing: `/{projectName}/{adapterName}{basePath}`
- Default project: No project prefix
- Native endpoints: Adapter-specific (e.g., `/openai/models` for model listing)

**Outgoing:**
- None - Gateway does not send webhooks to external services
- Logging callbacks: Winston to console/files only
- Plugin callbacks: Internal to gateway
- Provider callbacks: Streaming responses streamed back to client

## Adapter Registration

**Built-in Adapters:**
- OpenAI: Registered in config via `adapters` array with `type: "openai"`
- Anthropic: Registered in config via `adapters` array with `type: "anthropic"`
- Default adapters: Both registered automatically if not specified

**Adapter Loading:**
- Location: `src/adapters/factory.ts`
- Factory pattern: `LLMApiAdaptersFactory`
- Extension system: Supports external adapters via extension loader
- Configuration: `availableExtensions` in gateway config

## Plugin Extensions

**External Plugin Support:**
- Loaded via `src/extensions/extentionsLoader.ts`
- Configuration: `availableExtensions` array in gateway config
- Can be local paths or npm modules
- Implements: `IPlugin` interface from SDK
- Phases: beforeModel, afterModel, afterChunk, onModelError, detachedAfterResponse

**Bundled Plugins:**
- Basic Auth: `src/plugins/bundled/basic-apikey-auth/`
- Regex Hider: `src/plugins/bundled/regex-hider/` (PII masking)
- Model Router: `src/plugins/bundled/model-router/` (request routing)
- Prompt Manager: `src/plugins/bundled/promt-manager/` (prompt templating)

## Rate Limiting & Throttling

**Not configured:**
- No built-in rate limiting
- Relies on provider rate limits
- Upstream: LLM providers enforce their own limits
- Recommendation: Implement via external reverse proxy or plugin

## Request/Response Format

**Input Format:**
- OpenAI-compatible Chat Completion API format
- Adapter transforms to internal `ILLMRequest` format
- Field mapping in: `src/adapters/openai.ts:121-182`

**Output Format:**
- OpenAI-compatible Chat Completion response format
- Adapter transforms from internal `ILLMResponse` format
- Field mapping in: `src/adapters/openai.ts:273-324`

**Streaming:**
- Server-Sent Events (SSE) format
- OpenAI-compatible chunks with `data: ` prefix
- End marker: `data: [DONE]\n\n`
- Implementation: `src/adapters/openai.ts:232-271`

---

*Integration audit: 2026-01-20*
