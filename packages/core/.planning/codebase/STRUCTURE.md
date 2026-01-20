# Codebase Structure

**Analysis Date:** 2026-01-20

## Directory Layout

```
packages/core/
├── src/                          # Source code (TypeScript)
│   ├── index.ts                  # Main entry point for programmatic use
│   ├── cli.ts                    # CLI entry point
│   ├── gateway.ts                # GatewayServer - main HTTP server and orchestrator
│   ├── adapters/                 # API format adapters (OpenAI, Anthropic)
│   │   ├── factory.ts            # Adapter factory for creating instances
│   │   ├── manager.ts            # Adapter manager for initialization/lifecycle
│   │   ├── openai.ts             # OpenAI API format adapter
│   │   └── antropic.ts           # Anthropic API format adapter
│   ├── providers/                # LLM provider implementations
│   │   ├── openai.ts             # OpenAI provider
│   │   ├── anthropic.ts          # Anthropic provider
│   │   └── providerRegistry.ts   # Registry for creating provider instances
│   ├── plugins/                  # Plugin system
│   │   ├── manager.ts            # Plugin manager - executes plugin pipeline
│   │   ├── factory.ts            # Plugin factory for creating instances
│   │   └── bundled/              # Built-in plugins
│   │       ├── basic-apikey-auth/ # API key authentication plugin
│   │       ├── model-router/      # Model routing/selection plugin
│   │       ├── promt-manager/     # Prompt template plugin
│   │       └── regex-hider/       # Content filtering plugin
│   ├── models/                   # Model configuration and registry
│   │   └── modelRegistry.ts      # Registry mapping model names to providers
│   ├── config/                   # Configuration loading and validation
│   │   ├── loader.ts             # YAML/JSON config loader with Joi validation
│   │   └── gatewayConfig.ts      # TypeScript type definitions for config
│   ├── extensions/               # Dynamic extension loading system
│   │   └── extentionsLoader.ts   # Loads plugins/adapters/providers from modules
│   └── utils/                    # Shared utilities
│       └── logger.ts             # Winston logger wrapper
├── tests/                        # Test files
│   ├── unit/                     # Unit tests
│   │   ├── plugins/              # Plugin tests
│   │   ├── providers/            # Provider tests
│   │   └── utils/                # Utility tests
│   ├── integration/              # Integration tests
│   ├── e2e/                      # End-to-end tests
│   └── fixtures/                 # Test data and mocks
├── dist/                         # Compiled output (auto-generated)
├── package.json                  # Project manifest and scripts
├── tsconfig.json                 # TypeScript configuration
└── .planning/
    └── codebase/                 # GSD planning documents
```

## Directory Purposes

**src/**
- Purpose: All source TypeScript files
- Contains: Server implementation, adapters, providers, plugins, config
- Key files: `gateway.ts` (main logic), `index.ts` (entry point), `cli.ts` (CLI)

**src/adapters/**
- Purpose: API format translation layer
- Contains: Adapter implementations for converting between API formats
- Key files: `openai.ts`, `antropic.ts`
- Pattern: Each adapter implements `ILLMApiAdapter` interface for input/output transformation

**src/providers/**
- Purpose: LLM backend integrations
- Contains: Provider implementations (OpenAI API client, Anthropic API client)
- Key files: `openai.ts`, `anthropic.ts`, `providerRegistry.ts`
- Pattern: Each provider implements `IProvider` interface with `execute()` and `executeStreaming()`

**src/plugins/bundled/**
- Purpose: Built-in middleware plugins
- Contains: Plugin implementations for auth, routing, prompting, filtering
- Key plugins: `basic-apikey-auth/`, `model-router/`, `promt-manager/`, `regex-hider/`
- Pattern: Each plugin implements `IPlugin` interface with lifecycle methods

**src/models/**
- Purpose: Model configuration and resolution
- Contains: `ModelRegistry` which maps model names to provider instances
- Key file: `modelRegistry.ts`
- Responsibility: Create models from config, handle model lookup, default model

**src/config/**
- Purpose: Configuration management
- Contains: Config loader with YAML/JSON parsing, Joi validation, type definitions
- Key files: `loader.ts`, `gatewayConfig.ts`
- Pattern: Load time validation ensures all configs are correct before runtime

**src/extensions/**
- Purpose: Dynamic extension loading system
- Contains: `ExtensionsLoader` for discovering and registering plugins/adapters/providers
- Key file: `extentionsLoader.ts`
- Pattern: Scans module exports, validates interface implementation, extracts metadata

**src/utils/**
- Purpose: Shared utilities
- Contains: Logger wrapper around Winston
- Key file: `logger.ts`

**tests/**
- Purpose: Test files organized by test type
- Contains: Unit tests, integration tests, E2E tests, fixtures
- Directories: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/fixtures/`
- Pattern: Tests co-located by component (e.g., `tests/unit/plugins/`)

**dist/**
- Purpose: Compiled JavaScript output
- Generated: Yes (auto-compiled from src/)
- Committed: No (in .gitignore)
- Pattern: Mirrors `src/` directory structure

## Key File Locations

**Entry Points:**
- `src/index.ts`: Main programmatic entry point - exports `GatewayServer`, starts server if run directly
- `src/cli.ts`: CLI entry point - parses commands via Commander.js (start, config)
- `src/gateway.ts`: Core server class - 576 lines, contains HTTP routing and request orchestration

**Configuration:**
- `src/config/loader.ts`: YAML/JSON parser with environment variable substitution and Joi validation
- `src/config/gatewayConfig.ts`: TypeScript interfaces for all configuration types
- `package.json`: NPM scripts, dependencies, bin field for CLI

**Core Logic:**
- `src/gateway.ts` (lines 133-236): `handleLLMRequest()` - Main request orchestration
- `src/plugins/manager.ts` (lines 73-134): `executePluginFunction()` - Plugin pipeline execution
- `src/models/modelRegistry.ts` (lines 22-45): `initializeModels()` - Model setup

**Adapter/Provider/Plugin Factories:**
- `src/adapters/factory.ts`: Creates adapter instances from registered types
- `src/providers/providerRegistry.ts`: Creates and validates provider instances
- `src/plugins/factory.ts`: Creates plugin instances

**Extension Loading:**
- `src/extensions/extentionsLoader.ts`: Dynamic module loading, interface validation, metadata extraction

## Naming Conventions

**Files:**
- `*Registry.ts`: Classes that manage collections of entities (e.g., `ModelRegistry`, `ProviderRegistry`)
- `*Manager.ts`: Classes that orchestrate lifecycle/execution (e.g., `PluginManager`, `LLMApiAdaptersManager`)
- `*Factory.ts`: Classes that create instances (e.g., `LLMApiAdaptersFactory`, `PluginFactory`)
- `*Loader.ts`: Classes that load resources (e.g., `ConfigLoader`, `ExtensionsLoader`)
- Interface files named after implementation (e.g., `openai.ts`, `anthropic.ts`)

**Directories:**
- `bundled/`: Built-in implementations (plugins, adapters, providers)
- `src/`: Source TypeScript files
- `dist/`: Compiled JavaScript output
- `tests/`: Test files, organized by type (unit, integration, e2e, fixtures)

## Where to Add New Code

**New Plugin:**
1. Create directory: `src/plugins/bundled/{plugin-name}/`
2. Create implementation: `src/plugins/bundled/{plugin-name}/{pluginName}Plugin.ts`
3. Export class implementing `IPlugin` with static `metadata` property
4. Implement lifecycle methods: `beforeModel()`, `afterModel()`, `afterChunk()`, `onModelError()`, `detachedAfterResponse()` as needed
5. Add tests: `tests/unit/plugins/{plugin-name}.spec.ts`
6. Register in config YAML under `plugins:` array

**New Adapter:**
1. Create file: `src/adapters/{adapterName}.ts`
2. Export class implementing `ILLMApiAdapter` interface
3. Implement: `transformInput()`, `transformOutput()`, `transformOutputChunk()`, `configure()`, `validateConfig()`
4. Register in `src/adapters/factory.ts` line 24-25
5. Add tests: `tests/unit/adapters/{adapterName}.spec.ts`
6. Reference in config YAML under `adapters:` array

**New Provider:**
1. Create file: `src/providers/{providerName}.ts`
2. Export class implementing `IProvider` interface
3. Implement: `execute()`, `executeStreaming()`, `configure()`, `validateConfig()`
4. Register in `src/providers/providerRegistry.ts` line 20-21
5. Add tests: `tests/unit/providers/{providerName}.spec.ts`
6. Configure in YAML: `models[].provider.type` references provider name

**New Utility:**
- Add to `src/utils/`
- Import where needed
- Keep functions pure and focused on single responsibility

**New Configuration:**
- Update `GatewayConfig` interface in `src/config/gatewayConfig.ts`
- Update Joi schema in `src/config/loader.ts` method `createValidationSchema()`
- Document in README

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript
- Generated: Yes (npm run build → tsc)
- Committed: No
- Pattern: TypeScript compiles with declaration maps for IDE support

**coverage/:**
- Purpose: Code coverage reports
- Generated: Yes (npm run test:coverage)
- Committed: No
- Pattern: Jest generates HTML reports in coverage/lcov-report/

**tests/fixtures/**
- Purpose: Shared test data, mock responses, test helpers
- Contains: Mock API responses, test config files, factory functions for test data
- Used by: All test suites via imports

## Environment Variables

**Required for Runtime:**
- `PORT`: Server port (default: 3000)
- Model-specific credentials: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
- Substituted in config via `${VAR_NAME}` or `$VAR_NAME` syntax

**Optional:**
- `NODE_ENV`: 'development', 'test', 'production'
- `LOG_LEVEL`: 'debug', 'info', 'warn', 'error'

## Configuration File Locations

- Config specified at runtime via: CLI `-c/--config` flag or `GatewayServer(configPath)` constructor
- Supports: YAML (.yaml, .yml) or JSON (.json) formats
- Environment variable replacement: `${VAR_NAME}` patterns expanded before validation
- Schema validation: All configs validated against Joi schema at load time
- Watch mode: Optional config file watcher via `ConfigLoader.watch()` for development
