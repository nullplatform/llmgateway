# Technology Stack

**Analysis Date:** 2026-01-20

## Languages

**Primary:**
- TypeScript 5.0.0 - Entire codebase, type-safe development

**Runtime Language:**
- JavaScript (compiled from TypeScript to CommonJS ES2022)

## Runtime

**Environment:**
- Node.js >= 18.0.0 (required by monorepo)
- npm >= 9.0.0 (required by monorepo)

**Package Manager:**
- npm (monorepo workspaces)
- Lockfile: Present (package-lock.json, managed at root level)

## Frameworks

**Core Web:**
- Express 4.18.0 - HTTP server, routing, middleware

**Security:**
- Helmet 7.0.0 - HTTP security headers

**Utilities:**
- Commander 14.0.0 - CLI argument parsing
- YAML 2.3.0 - Configuration file parsing
- Joi 17.11.0 - Configuration schema validation
- uuid 9.0.0 - Request ID generation
- axios 1.6.0 - HTTP client for LLM API calls
- dotenv 16.3.0 - Environment variable loading
- cors 2.8.0 - CORS middleware

**Logging:**
- winston 3.11.0 - Structured logging

**File Watching (Development):**
- chokidar 4.0.3 - Configuration file change detection (in root package.json)

## SDK & Internal Packages

**Local SDK:**
- @nullplatform/llm-gateway-sdk 1.1.0 - Plugin/adapter interface definitions
  - Location: `packages/sdk/`
  - Provides core interfaces: `IProvider`, `ILLMApiAdapter`, `IPlugin`, etc.

**Core Package:**
- @nullplatform/llm-gateway 1.1.2 - Main proxy server
  - Location: `packages/core/`

## Testing & Development

**Test Framework:**
- jest 29.0.0 - Test runner
- ts-jest 29.0.0 - TypeScript support for Jest
- @types/jest 29.0.0 - Jest type definitions
- supertest 7.1.1 - HTTP request testing
- @types/supertest 6.0.3 - Supertest types
- nock 14.0.5 - HTTP mocking

**Build & Runtime:**
- tsx 4.0.0 - TypeScript execution for CLI and development

**Compilation:**
- typescript 5.0.0 - TypeScript compiler

**Type Definitions:**
- @types/node 20.0.0 - Node.js type definitions
- @types/express 4.17.0 - Express type definitions
- @types/cors 2.8.0 - CORS type definitions
- @types/uuid 9.0.0 - UUID type definitions

## Database & Analytics

**ClickHouse Integration (Optional):**
- @clickhouse/client 1.11.2 - ClickHouse official client (in root package.json)
- clickhouse 2.6.0 - Alternative ClickHouse client (in root package.json)
- Used by: ClickHouse tracer plugin for analytics and conversation storage
- Reference: `config/gateway.example.yaml` shows ClickHouse configuration

## Linting & Code Quality

**ESLint Stack (Monorepo):**
- @typescript-eslint/eslint-plugin 6.0.0
- @typescript-eslint/parser 6.0.0
- eslint 8.0.0

## Configuration

**Environment:**
Configured via environment variables loaded from `.env` file using `dotenv`. Key variables required:
- `OPENAI_API_KEY` - OpenAI API authentication
- `ANTHROPIC_API_KEY` - Anthropic API authentication
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Runtime environment (production enables file logging)

**Configuration Files:**
- `config/gateway.example.yaml` - Example YAML configuration showing all supported options
- Configuration supports both YAML and JSON formats
- Supports environment variable interpolation: `${VAR_NAME}` or `$VAR_NAME`

**Server Configuration:**
- Host: Configurable via `server.host` (default: 0.0.0.0)
- Port: Configurable via `server.port` (default: 3000)
- CORS: Configurable origins via `server.cors.origins` (default: ["*"])

**Logging Configuration:**
- Level: debug, info, warn, error (default: info)
- Format: json, simple (default: json)
- Destinations: console, file
- File path: Configurable (default: ./logs/gateway.log)

**Monitoring Configuration:**
- Health check endpoint (default: /health)
- Configurable metrics tracking
- Health check interval (default: 30 seconds)

## Build Configuration

**TypeScript:**
- `tsconfig.base.json` at root - Shared base configuration
  - Target: ES2022
  - Module: CommonJS
  - Path aliases: `@llm-gateway/*` maps to `packages/*/src`
  - Composite project enabled for monorepo
- `packages/core/tsconfig.json` - Core package configuration
  - Extends base configuration
  - Output: `dist/` directory

**Build Script:**
```bash
npm run build                    # Compile TypeScript to JavaScript in dist/
npm run dev                      # Watch mode TypeScript compilation with tsx
npm run test                     # Run Jest tests
npm run test:coverage            # Run tests with coverage report
```

## Entry Points

**CLI:**
- Binary: `dist/cli.js`
- Configured in `package.json` bin field: `"llm-gateway": "dist/cli.js"`
- Usage: `llm-gateway start --config <path>`

**Server:**
- Main: `dist/index.js`
- Programmatic: Export `GatewayServer` class from `dist/index.js`

**Development Entry:**
- `src/cli.ts` - CLI interface
- `src/index.ts` - Server initialization
- `src/gateway.ts` - Core gateway implementation

## Plugin System

**Bundled Plugins Location:** `src/plugins/bundled/`
- `basic-apikey-auth/` - API key authentication
- `regex-hider/` - PII redaction with regex patterns
- `model-router/` - Model routing with fallbacks
- `prompt-manager/` - Prompt templating and management

**Plugin System Features:**
- Plugins loaded via extension loader mechanism
- Supports external plugins via configuration
- Plugin phases: beforeModel, afterModel, afterChunk, onModelError, detachedAfterResponse

**Plugin Execution Order:**
- Priority-based (0-1000, lower = higher priority)
- Phases executed in sequence per request
- Plugins can modify context and control request flow

## LLM Provider Adapters

**Built-in Adapters:**
- `src/adapters/openai.ts` - OpenAI Chat Completions API
- `src/adapters/anthropic.ts` - Anthropic Messages API
- Adapters registered via factory pattern in `src/adapters/factory.ts`

**Provider Support:**
- OpenAI: Full support for streaming and non-streaming
- Anthropic: Full support for streaming and non-streaming
- Extensible via SDK for custom providers

## Platform Requirements

**Development:**
- Node.js 18+
- npm 9+
- TypeScript knowledge
- Ability to run local servers on port 3000 (default)

**Production:**
- Node.js 18+ runtime
- Available disk space for logs (if file logging enabled)
- Network connectivity to LLM APIs:
  - OpenAI: https://api.openai.com/v1
  - Anthropic: https://api.anthropic.com
- Optional: ClickHouse instance for analytics

**Distribution:**
- Distributed as npm package: `@nullplatform/llm-gateway`
- Published to npm registry
- CLI tool available via `npx llm-gateway` or local installation

---

*Stack analysis: 2026-01-20*
