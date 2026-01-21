# Technology Stack

**Analysis Date:** 2026-01-21

## Languages

**Primary:**
- TypeScript 5.0.0 - Core application, providers, adapters, plugins
- JavaScript - Runtime execution in Node.js, CLI tools

**Secondary:**
- YAML - Configuration files (`gateway.example.yaml`)
- Shell - Build and CLI scripts

## Runtime

**Environment:**
- Node.js >=18.0.0 (Required)
- npm >=9.0.0 (Required)

**Package Manager:**
- npm (Workspace monorepo)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Express 4.18.0 - HTTP server and REST API routing
- Commander 14.0.0 - CLI command parsing and management

**Testing:**
- Jest 29.0.0 - Unit, integration, and E2E test framework
- ts-jest 29.0.0 - TypeScript support for Jest
- Supertest 7.1.1 - HTTP assertion and request mocking
- Nock 14.0.5 - HTTP request mocking for tests

**Build/Dev:**
- TypeScript 5.0.0 - Language transpilation and type checking
- tsx 4.19.4 - Runtime TypeScript execution for development
- ts-node 10.9.2 - TypeScript REPL and script runner

## Key Dependencies

**Critical:**
- axios 1.6.0+ - HTTP client for provider API calls (OpenAI, Anthropic)
- @nullplatform/llm-gateway-sdk 1.1.0 - Core SDK types and interfaces (internal)
- @nullplatform/llm-gateway-clickhouse-tracer-plugin - Optional ClickHouse integration

**Infrastructure:**
- winston 3.11.0 - Structured logging with transports (console, file)
- dotenv 16.3.0 - Environment variable loading
- helmet 7.0.0 - Express security middleware
- cors 2.8.0 - Cross-Origin Resource Sharing middleware
- uuid 9.0.0 - Request ID generation
- joi 17.11.0 - Schema validation for configuration
- yaml 2.3.0 - YAML parsing for gateway configuration
- @clickhouse/client 1.11.2 - ClickHouse database client (optional)
- clickhouse 2.6.0 - Alternative ClickHouse client (optional)
- chokidar 4.0.3 - File system watching for plugin hot-reload

## Configuration

**Environment:**
- Port: `process.env.PORT` (default: 3000)
- Node environment: `process.env.NODE_ENV`
- Provider API Keys: `${OPENAI_API_KEY}`, `${ANTHROPIC_API_KEY}` (environment variable substitution in YAML)
- Home directory: `process.env.HOME`, `process.env.APPDATA` (for global npm modules)

**Build:**
- TypeScript configuration: `tsconfig.json` (root and per-package)
- Jest configuration: `packages/core/jest.config.js`
- ESLint configuration: `.eslintrc` (root configuration in monorepo)

**Configuration Files:**
- Main gateway config: `config/gateway.example.yaml` (YAML format)
- Environment file: `.env` (dotenv format, runtime loaded)

## Platform Requirements

**Development:**
- Node.js >=18.0.0
- npm >=9.0.0
- TypeScript 5.0.0+
- Git (for repository management)

**Production:**
- Node.js >=18.0.0
- Express-compatible server environment
- Sufficient memory for concurrent LLM provider connections
- Optional: ClickHouse server (if tracing/monitoring enabled)

**External API Requirements:**
- OpenAI API key for OpenAI provider
- Anthropic API key for Claude provider
- Optional: ClickHouse server credentials for conversation tracing

---

*Stack analysis: 2026-01-21*
