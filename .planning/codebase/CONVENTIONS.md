# Coding Conventions

**Analysis Date:** 2026-01-21

## Naming Patterns

**Files:**
- PascalCase for classes: `basicApiKeyAuthPlugin.ts`, `PluginManager.ts`, `Logger.ts`
- camelCase for utilities and modules: `logger.ts`, `factory.ts`, `manager.ts`, `loader.ts`
- kebab-case for directory names: `basic-apikey-auth`, `regex-hider`, `model-router`, `promt-manager`

**Functions:**
- camelCase for all function and method names: `loadPlugins()`, `beforeModel()`, `transformInput()`, `validateConfig()`
- Private methods prefixed with underscore: `_setupInterceptors()`, `_replaceEnvVars()`, `_getNestedProperty()`, `_transformError()`
- Async functions use same naming convention with no special prefix: `async configure()`, `async load()`, `async execute()`

**Variables:**
- camelCase for local variables and parameters: `pluginConfig`, `mockContext`, `httpRequest`, `lastExecution`
- UPPERCASE_SNAKE_CASE for constants: `LOG_LEVEL`, `NODE_ENV`, `ENOENT`
- Descriptive names reflecting purpose: `lastPluginExecution`, `mockPluginCallTracker`, `collectionCoverageFrom`

**Types and Interfaces:**
- PascalCase for all type and interface names: `IPlugin`, `IRequestContext`, `IPluginResult`, `OpenAIRequest`, `GatewayConfig`
- Generic type parameters: `T`, `R` for simple types; `K`, `V` for map keys/values
- Prefix `I` for interfaces: `IPlugin`, `IProvider`, `ILLMRequest`, `IHTTPRequest`

## Code Style

**Formatting:**
- No explicit formatter configured in project (no .prettierrc or .eslintrc)
- Observed style: 2-space indentation throughout
- Line length: No strict limit observed, but generally kept reasonable (80-120 characters)
- Trailing commas in objects/arrays when multi-line

**Linting:**
- ESLint configured in root: `@typescript-eslint/eslint-plugin@^6.0.0`, `@typescript-eslint/parser@^6.0.0`
- Lint command: `npm run lint` (runs `eslint packages/*/src/**/*.ts`)
- Configuration files not present in repo, using defaults

## Import Organization

**Order:**
1. Node.js built-in modules: `import * as fs from 'fs/promises'`, `import * as path from 'path'`
2. Third-party packages: `import axios from 'axios'`, `import * as winston from 'winston'`, `import * as Joi from 'joi'`
3. Type/interface imports from SDK: `import { IPlugin, IRequestContext } from '@nullplatform/llm-gateway-sdk'`
4. Local module imports: `import { Logger } from '../utils/logger.js'`, `import { GatewayConfig } from '../config/gatewayConfig'`
5. Relative imports use `.js` extension for ES modules: `from './gateway.js'`, `from '../utils/logger.js'`

**Path Aliases:**
- Base alias configured in tsconfig: `@llm-gateway/*` maps to `./packages/*/src`
- Not heavily used in codebase; relative imports preferred
- Example would be: `import { Logger } from '@llm-gateway/core/utils/logger'`

**Example Import Block** (from `packages/core/src/config/loader.ts`):
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';
import * as Joi from 'joi';
import { GatewayConfig } from "./gatewayConfig";
```

## Error Handling

**Patterns:**
- Try-catch blocks for async operations with explicit error handling
- Specific error codes checked: `error.code === 'ENOENT'` for file not found
- Custom error classes used: `LLMModelError` for provider-specific errors
- Error details logged with metadata: `logger.error('message', { error, context })`
- HTTP error transformation: Extract OpenAI/provider error details and re-throw with enhanced context

**Example** (from `packages/core/src/config/loader.ts`):
```typescript
try {
    await fs.access(this.configPath);
    const configContent = await fs.readFile(this.configPath, 'utf-8');
} catch (error) {
    if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${this.configPath}`);
    }
    throw error;
}
```

**Provider Error Transformation** (from `packages/core/src/providers/openai.ts`):
```typescript
private transformError(error: any): Error {
    if (error.response) {
        const status = error.response.status;
        if (data?.error) {
            const message = `OpenAI API Error (${status}): ${openaiError.message}`;
            const transformedError = new Error(message);
            (transformedError as any).status = status;
            (transformedError as any).code = openaiError.code;
            return transformedError;
        }
    }
    if (error.code === 'ECONNABORTED') {
        return new Error('OpenAI API request timeout');
    }
    return error;
}
```

## Logging

**Framework:** Winston (`winston@^3.11.0`)

**Patterns:**
- Use class-based Logger wrapper: `packages/core/src/utils/logger.ts`
- Logger methods: `debug()`, `info()`, `warn()`, `error()`
- All methods accept message string and optional metadata object: `logger.info('message', { key: 'value' })`
- Sensitive data sanitized before logging: API keys, authorization headers redacted
- Plugin execution logged: `logger.logPluginExecution(pluginName, phase, duration, success)`
- HTTP requests logged: `logger.logRequest(req, res, duration)`
- Provider requests logged: `logger.logProviderRequest(provider, model, tokens, duration)`

**Example** (from `packages/core/src/utils/logger.ts`):
```typescript
info(message: string, meta?: any): void {
    this.winston.info(message, meta);
}

logPluginExecution(pluginName: string, phase: string, duration: number, success: boolean): void {
    const level = success ? 'debug' : 'warn';
    this[level]('Plugin execution', {
        plugin: pluginName,
        phase,
        duration_ms: duration,
        success
    });
}
```

**Logger Configuration** (from `packages/core/src/utils/logger.ts`):
- Console transport with colorized output in development
- File transports added in production: `logs/error.log` and `logs/combined.log`
- Default metadata includes service name: `{ service: 'llm-gateway' }`
- Log level controlled via constructor parameter or `setLevel()` method
- Performance timing helper: `logger.time(label)` returns duration function

## Comments

**When to Comment:**
- Public method purposes documented (no formal JSDoc requirement observed)
- Complex business logic explained inline
- Workarounds or temporary solutions flagged with `//TODO:` comment

**Example** (from `packages/core/src/plugins/bundled/promt-manager/promtManagerPlugin.ts`):
```typescript
//TODO: merge metadata if needed
```

**JSDoc/TSDoc:**
- Not heavily used in codebase
- Type annotations preferred over JSDoc comments
- TypeScript types provide self-documentation through interfaces

## Function Design

**Size:**
- Most methods 10-40 lines, some utility methods shorter
- Complex logic broken into private helper methods
- Examples: `transformInput()` (10 lines), `loadPlugins()` (20 lines)

**Parameters:**
- Prefer single object parameter for functions with many options
- Example: `MockPlugin constructor(name: string, options: { beforeModelResult?, afterModelResult?, shouldThrow? })`
- Keep parameter lists short (max 4-5 parameters before using object)

**Return Values:**
- Use type unions for multiple return possibilities: `Promise<T> | void`
- Nullable returns handled explicitly: return `null` or `undefined` not thrown
- Plugin methods return structured `IPluginResult` with properties: `{ success, error, context, terminate, status }`

**Example** (from `packages/core/src/adapters/openai.ts`):
```typescript
async validate(request: any): Promise<string | null> {
    if (!request.model || typeof request.model !== 'string') {
        return 'Model must be a non-empty string';
    }
    // ... validation logic
    return null; // No validation errors
}
```

## Module Design

**Exports:**
- Export classes directly: `export class PluginManager { }`
- Export interfaces alongside implementations: `export interface OpenAIRequest { }`
- Re-export from index files: `export { GatewayServer } from './gateway.js'`
- Use named exports, not default exports

**Barrel Files:**
- Used in SDK: `src/index.ts` for main entry point
- Example from `packages/core/src/index.ts`:
```typescript
export { GatewayServer } from './gateway.js';
export { PluginManager } from './plugins/manager.js';
export * from './providers/openai.js';
```

**Module Organization:**
- Service classes grouped by domain: `plugins/`, `adapters/`, `providers/`, `config/`, `utils/`
- Plugin implementations in subdirectories: `plugins/bundled/basic-apikey-auth/`, `plugins/bundled/regex-hider/`
- Tests mirror source structure: `tests/unit/`, `tests/integration/`, `tests/e2e/`

---

*Convention analysis: 2026-01-21*
