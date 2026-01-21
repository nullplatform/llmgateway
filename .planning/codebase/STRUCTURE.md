# Codebase Structure

**Analysis Date:** 2026-01-21

## Directory Layout

```
llm-gateway/
├── packages/
│   ├── core/                          # Main gateway server
│   │   ├── src/
│   │   │   ├── adapters/              # API format translators
│   │   │   ├── config/                # Configuration loading & validation
│   │   │   ├── extensions/            # Dynamic extension loader
│   │   │   ├── models/                # Model registry & lookup
│   │   │   ├── plugins/               # Plugin pipeline & bundled plugins
│   │   │   ├── providers/             # LLM provider implementations
│   │   │   ├── utils/                 # Shared utilities (logger, etc)
│   │   │   ├── gateway.ts             # Main server class
│   │   │   ├── cli.ts                 # CLI entry point
│   │   │   └── index.ts               # Server entry point
│   │   ├── tests/                     # Test files
│   │   ├── dist/                      # Compiled output (generated)
│   │   ├── package.json               # Core package manifest
│   │   └── tsconfig.json              # TypeScript config
│   ├── sdk/                           # Shared types & interfaces
│   │   ├── src/
│   │   │   ├── types/                 # TypeScript interfaces
│   │   │   ├── utils/                 # Validation utilities
│   │   │   └── index.ts               # SDK exports
│   │   ├── package.json               # SDK package manifest
│   │   └── dist/                      # Compiled output (generated)
│   └── plugins/                       # External plugin packages
│       ├── clickhouse-tracer/         # Telemetry plugin
│       └── logger/                    # Logging plugin
├── config/                            # Configuration examples
│   └── gateway.example.yaml           # Example gateway config
├── docs/                              # Documentation
├── package.json                       # Monorepo manifest
├── tsconfig.base.json                 # Base TypeScript config
├── tsconfig.json                      # Root TypeScript config
└── .planning/                         # GSD planning directory (generated)
    └── codebase/                      # Architecture analysis docs
```

## Directory Purposes

**packages/core/src/adapters/:**
- Purpose: Transform between external LLM API formats and internal standardized format
- Contains: Adapter implementations, adapter factory, adapter manager
- Key files: `factory.ts` (creates adapters), `openai.ts` (OpenAI protocol), `antropic.ts` (Anthropic protocol)
- Pattern: Each adapter implements `ILLMApiAdapter` interface with `transformInput()`, `transformOutput()`, `transformOutputChunk()` methods

**packages/core/src/config/:**
- Purpose: Load, validate, and provide access to gateway configuration
- Contains: Configuration loader, schema definitions, gateway config types
- Key files: `loader.ts` (YAML/JSON parsing, env var replacement, validation), `gatewayConfig.ts` (TypeScript interfaces)
- Pattern: ConfigLoader reads file, validates against Joi schema, caches parsed config

**packages/core/src/extensions/:**
- Purpose: Dynamically discover and register plugins, adapters, and providers from external modules
- Contains: Extension loader, interface validators, module resolution logic
- Key files: `extentionsLoader.ts` (main loader, supports local paths and npm modules)
- Pattern: Loader imports modules, discovers classes implementing IPlugin/IAdapter/IProvider, validates with metadata

**packages/core/src/models/:**
- Purpose: Maintain registry of available models and bind them to providers
- Contains: Model registry implementation
- Key files: `modelRegistry.ts` (model lookup, default model management, filtering by provider)
- Pattern: Registry maps model names to IModel objects containing provider instances

**packages/core/src/plugins/:**
- Purpose: Middleware hooks for transforming requests/responses and error handling
- Contains: Plugin manager, plugin factory, bundled plugin implementations
- Key files:
  - `manager.ts` (executes plugin pipeline by phase, conditional execution)
  - `factory.ts` (creates plugin instances from type string)
  - `bundled/basic-apikey-auth/` (API key validation plugin)
  - `bundled/model-router/` (route requests to different models)
  - `bundled/prompt-manager/` (prompt template management)
  - `bundled/regex-hider/` (regex-based content hiding)
- Pattern: Each plugin implements IPlugin with optional phase methods (beforeModel, afterModel, afterChunk, onModelError, detachedAfterResponse)

**packages/core/src/providers/:**
- Purpose: Execute LLM requests against external providers (OpenAI, Anthropic, etc)
- Contains: Provider implementations, provider registry
- Key files: `openai.ts` (OpenAI API client), `anthropic.ts` (Anthropic API client), `providerRegistry.ts` (provider factory)
- Pattern: Each provider implements IProvider with `execute()` and `executeStreaming()` methods

**packages/core/src/utils/:**
- Purpose: Shared utility functions
- Contains: Logger implementation
- Key files: `logger.ts` (Winston logger wrapper)

**packages/sdk/src/types/:**
- Purpose: Shared TypeScript interfaces consumed by core, plugins, adapters, and providers
- Contains: Interface definitions for plugin, provider, adapter, request context, extension
- Key files:
  - `plugin.ts` (IPlugin, IPluginConfig, IPluginResult interfaces)
  - `provider.ts` (IProvider interface)
  - `request.ts` (ILLMRequest, ILLMResponse interfaces)
  - `context.ts` (IRequestContext interface)
  - `extension.ts` (IConfigurableExtension base interface)

## Key File Locations

**Entry Points:**
- `packages/core/src/index.ts`: Server entry point, loads env vars, initializes GatewayServer, sets up signal handlers
- `packages/core/src/cli.ts`: CLI entry point, parses commands, starts server with config path
- `packages/core/src/gateway.ts`: Main server class, HTTP middleware setup, request handler, initialization logic

**Configuration:**
- `packages/core/src/config/loader.ts`: Loads and validates YAML/JSON config files, replaces environment variables
- `packages/core/src/config/gatewayConfig.ts`: TypeScript interfaces for config schema
- `config/gateway.example.yaml`: Example configuration

**Core Logic:**
- `packages/core/src/gateway.ts`: Main request handler loop, plugin/adapter/provider orchestration
- `packages/core/src/plugins/manager.ts`: Plugin lifecycle and execution orchestration
- `packages/core/src/models/modelRegistry.ts`: Model lookup and resolution
- `packages/core/src/adapters/manager.ts`: Adapter initialization and retrieval
- `packages/core/src/providers/providerRegistry.ts`: Provider creation and caching

**Testing:**
- `packages/core/tests/`: Jest test files organized by test type (unit, integration, e2e)

## Naming Conventions

**Files:**
- PascalCase for class implementations: `GatewayServer.ts`, `PluginManager.ts`, `OpenAIProvider.ts`
- camelCase for utility files: `logger.ts`, `loader.ts`
- Adapter implementations: `[ProviderName].ts` (e.g., `openai.ts`, `antropic.ts`)
- Plugin implementations: `[pluginName]Plugin.ts` (e.g., `basicApiKeyAuthPlugin.ts`)

**Directories:**
- kebab-case for feature directories: `basic-apikey-auth/`, `model-router/`, `regex-hider/`
- camelCase for internal directories: `adapters/`, `plugins/`, `providers/`, `config/`, `extensions/`

**Classes:**
- PascalCase: `GatewayServer`, `PluginManager`, `ConfigLoader`
- Suffix with pattern: `*Manager` for registry/orchestrators, `*Factory` for factories, `*Registry` for lookups

**Interfaces:**
- Prefix with `I`: `IPlugin`, `IProvider`, `ILLMApiAdapter`, `IRequestContext`
- Suffix with pattern: `*Config` for configuration, `*Result` for results, `*Manager` for managers

**Functions:**
- camelCase: `transformInput()`, `beforeModel()`, `executeStreaming()`
- Prefix with `on` for event handlers: `onModelError()`, `onData()`

## Where to Add New Code

**New Feature:**
- Primary code: `packages/core/src/[feature-name]/`
- Tests: `packages/core/tests/unit/[feature-name].test.ts` or `packages/core/tests/integration/[feature-name].test.ts`
- Export from: `packages/core/src/index.ts` if public API

**New Plugin:**
- Implementation: `packages/core/src/plugins/bundled/[plugin-name]/[plugin-name]Plugin.ts`
- Configuration: Plugin type name in config YAML under `plugins:` array with `type: "[plugin-name]"`
- Register in: `packages/core/src/plugins/factory.ts` loadNativePlugins() method
- Tests: `packages/core/tests/unit/plugins/[plugin-name].test.ts`

**New Adapter:**
- Implementation: `packages/core/src/adapters/[adapter-name].ts`
- Register in: `packages/core/src/adapters/factory.ts` registerBuiltInAdapters() method
- Configuration: Adapter type name in config YAML under `adapters:` array with `type: "[adapter-name]"`
- Tests: `packages/core/tests/unit/adapters/[adapter-name].test.ts`

**New Provider:**
- Implementation: `packages/core/src/providers/[provider-name].ts`
- Register in: `packages/core/src/providers/providerRegistry.ts` registerBuiltInFactories() method
- Configuration: Provider type name in model config under `provider:` with `type: "[provider-name]"`
- Tests: `packages/core/tests/unit/providers/[provider-name].test.ts`

**Utilities:**
- Shared helpers: `packages/core/src/utils/[utility-name].ts`
- Exported from: `packages/core/src/utils/index.ts` (create if needed)

**SDK Types:**
- New interfaces: `packages/sdk/src/types/[domain].ts`
- Exported from: `packages/sdk/src/index.ts`
- Used by: Core, plugins, adapters, providers

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (via `npm run build`)
- Committed: No (in .gitignore)
- Usage: Contains transpiled TypeScript, consumed by `npm start` and published to npm

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (via `npm install`)
- Committed: No (in .gitignore)
- Usage: Development and runtime dependencies

**coverage/:**
- Purpose: Test coverage reports
- Generated: Yes (via `npm run test:coverage`)
- Committed: No (in .gitignore)
- Usage: HTML reports of code coverage

**tests/:**
- Purpose: Jest test files
- Generated: No
- Committed: Yes
- Organization:
  - `tests/unit/`: Tests for individual functions/classes in isolation
  - `tests/integration/`: Tests for component interactions
  - `tests/e2e/`: End-to-end tests of full request flows

**config/:**
- Purpose: Configuration examples and defaults
- Generated: No
- Committed: Yes
- Usage: Reference configurations for deployment

---

*Structure analysis: 2026-01-21*
