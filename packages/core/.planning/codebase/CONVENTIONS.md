# Coding Conventions

**Analysis Date:** 2026-01-20

## Naming Patterns

**Files:**
- PascalCase for classes: `GatewayServer.ts`, `PluginManager.ts`, `ProviderRegistry.ts`
- camelCase for utility/service files: `logger.ts`, `loader.ts`
- kebab-case for directories with multiple words: `basic-apikey-auth/`, `model-router/`, `promt-manager/`
- `.test.ts` or `.test.js` suffix for test files co-located with implementation

**Functions:**
- camelCase: `beforeModel()`, `createPlugin()`, `registerBuiltInAdapters()`
- Private methods use camelCase with leading underscore avoided; private indicated by `private` keyword: `setupMiddleware()`, `handleLLMRequest()`
- Async functions consistently use `async` keyword

**Variables:**
- camelCase for local variables and properties: `pluginConfig`, `mockContext`, `accumulatedResponse`
- SCREAMING_SNAKE_CASE for constants: `LOG_LEVEL` (environment variable)
- snake_case for object properties from external APIs/config: `request_id`, `target_model`, `plugin_data`, `available_models`
- Underscore prefix for internal tracking: `retry_count`, `available_models`

**Types & Interfaces:**
- PascalCase for all interfaces: `IPlugin`, `IRequestContext`, `IPluginResult`, `ProjectRuntime`
- PascalCase for classes: `GatewayServer`, `Logger`, `PluginManager`
- Descriptive and verb-based for plugin methods: `beforeModel`, `afterModel`, `afterChunk`, `onModelError`, `detachedAfterResponse`

## Code Style

**Formatting:**
- No explicit formatter configured (no .eslintrc, .prettierrc, or eslint.config.* files detected)
- Code follows consistent spacing with 4-space indentation observed
- Semicolons used consistently throughout codebase
- Line length varies but generally under 120 characters

**Linting:**
- Not detected; configuration files not present in repo
- TypeScript compilation with strict mode implied from tsconfig.json settings

## Import Organization

**Order:**
1. External packages (express, cors, winston, etc.)
2. SDK imports from @nullplatform/llm-gateway-sdk
3. Local imports with ./ or ../
4. Named imports from local files with .js extension maintained

**Path Aliases:**
- `@/` maps to `<rootDir>/src/` as defined in jest.config.js moduleNameMapper
- Relative imports with explicit `.js` extensions used: `import { GatewayServer } from './gateway.js'`
- Import example from `src/gateway.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { PluginManager } from './plugins/manager';
import { ConfigLoader } from './config/loader';
import { Logger } from './utils/logger.js';
import {
    ILLMResponse, IModel,
    INativeAdapter,
    IPluginPhaseExecution,
    IRequestContext,
    LLMModelError
} from '@nullplatform/llm-gateway-sdk';
```

## Error Handling

**Patterns:**
- Try-catch blocks for async operations with logging: seen in `src/config/loader.ts` and `src/plugins/manager.ts`
- Custom error classes used: `LLMModelError` imported from SDK
- Errors logged with context metadata: `logger.error('message', { error, additional: data })`
- Error propagation with re-throw: errors caught, logged, and re-thrown to caller
- Plugin errors don't terminate process: caught and logged but execution continues with other plugins
- Request-level errors caught and returned as JSON response with request_id

**Example pattern from `src/gateway.ts` line 221:**
```typescript
catch (error) {
    if( error instanceof LLMModelError || error.name === 'LLMModelError') {
        context.error = error;
        const onModelError = await project.pipelineManager.onModelError(context);
        if( onModelError && onModelError.finalResult.reevaluateRequest) {
            reevaluateRequest = true;
            continue;
        }
    }
    next(error);
}
```

## Logging

**Framework:** Winston v3.11.0

**Pattern locations:** `src/utils/logger.ts`

**Key implementation:**
- Logger class wraps Winston with standardized methods: `debug()`, `info()`, `warn()`, `error()`
- Metadata passed as second parameter: `logger.info('message', { key: value })`
- Log levels configurable via environment: LOG_LEVEL (error, warn, info, debug)
- JSON format for structured logging with timestamps and stack traces
- Console transport always active; file transports added in production
- Request context added as metadata: request_id, method, path, user_agent, ip
- Plugin execution logged: `logger.info('Plugin execution', { plugin, phase, duration_ms, success })`
- Provider requests logged with token usage: `logger.info('Provider request', { provider, model, input_tokens, output_tokens, duration_ms })`

**Usage examples from codebase:**
```typescript
// From src/gateway.ts
this.logger.info('Starting LLM Gateway...');
this.logger.info('Incoming request', {
    request_id: req.id,
    method: req.method,
    path: req.path
});
```

## Comments

**When to Comment:**
- Complex algorithm logic: `mergeChunks()` in `src/gateway.ts` has explanatory comments
- Business logic transitions: phase execution comments like "// Determine a target model"
- Workarounds and temporary fixes: seen with TODO comments
- Unclear regex patterns: environment variable replacement regex in `src/config/loader.ts` has comment

**JSDoc/TSDoc:**
- Not consistently used across codebase
- TypeScript interfaces and types provide most documentation
- Function parameters typed with interfaces reducing need for param docs
- Only methods with custom implementations document behavior through comments

**TODO pattern:** Single TODO found at `src/plugins/bundled/promt-manager/promtManagerPlugin.ts:142`:
```typescript
//TODO: merge metadata if needed
```

## Function Design

**Size:**
- Most functions under 50 lines
- Largest function is `handleLLMRequest()` at ~110 lines due to complex retry/streaming logic
- Helper methods extract complex operations: `mergeChunks()`, `matchStringOrRegExp()`, `setupMiddleware()`

**Parameters:**
- Interfaces used for complex parameters: functions accept `IRequestContext`, `IPluginConfig`, config objects
- Destructuring used for object parameters
- No inline parameter objects; named interfaces preferred

**Return Values:**
- Consistent use of Promise types for async functions
- Union types used when multiple return possibilities: `Promise<void | IPluginPhaseExecution>`
- Functions return context-modified objects for plugin pipeline: `IPluginResult` with context, success, error fields
- Stream handlers return callbacks with Promises

**Example from `src/plugins/manager.ts` line 73:**
```typescript
async executePluginFunction(
    llmRequest: IRequestContext,
    pluginFunction: string,
    reverseOrder: boolean = false,
    isDettachedRun: boolean = false
): Promise<void | IPluginPhaseExecution>
```

## Module Design

**Exports:**
- Named exports used consistently: `export class GatewayServer`, `export interface ProjectRuntime`
- Main entry point `src/index.ts` exports core classes and functions
- SDK interfaces imported and re-exported from external SDK package
- Factory classes export create/build methods

**Barrel Files:**
- Not heavily used; imports are direct to specific files
- `src/index.ts` serves as main entry point with exports
- Plugin methods exported individually, not as barrel

**Design pattern observed:**
- Dependency injection through constructor: services receive dependencies rather than creating them
- Factory pattern for creating adapters and providers: `LLMApiAdaptersFactory`, `PluginFactory`, `ProviderRegistry`
- Manager pattern for coordinating multiple components: `PluginManager`, `ModelRegistry`, `LLMApiAdaptersManager`
- Service pattern for utilities: `Logger`, `ConfigLoader`

---

*Convention analysis: 2026-01-20*
