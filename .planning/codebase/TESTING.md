# Testing Patterns

**Analysis Date:** 2026-01-21

## Test Framework

**Runner:**
- Jest 29.0.0 (`jest@^29.0.0`)
- TypeScript support via ts-jest (`ts-jest@^29.0.0`)
- Config file: `packages/core/jest.config.js`

**Assertion Library:**
- Jest built-in matchers (expect API)
- Custom matchers extended in setup file for domain-specific assertions

**Run Commands:**
```bash
npm run test                    # Run all tests
npm run test:watch             # Watch mode for development
npm run test:coverage          # Generate coverage report
npm run test:unit              # Run unit tests only
npm run test:integration       # Run integration tests only
npm run test:e2e               # Run e2e tests only
npm run test:ci                # CI mode with coverage, no watch
```

## Test File Organization

**Location:**
- Tests co-located in `tests/` directory parallel to `src/`
- Structure mirrors source: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Example: Source `src/utils/logger.ts` → Test `tests/unit/utils/logger.test.ts`

**Naming:**
- Pattern: `{module}.test.ts` or `{module}.spec.ts`
- Observed: All use `.test.ts` suffix
- Examples: `basicApiKeyAuthPlugin.test.ts`, `providerRegistry.test.ts`, `gateway.test.ts`

**Structure:**
```
packages/core/
├── src/
│   ├── utils/
│   ├── plugins/
│   ├── providers/
│   └── config/
└── tests/
    ├── fixtures/
    ├── unit/
    │   ├── utils/
    │   ├── plugins/
    │   └── providers/
    ├── integration/
    ├── e2e/
    ├── setup.ts
    └── jest.config.js
```

## Test Structure

**Suite Organization:**
```typescript
describe('BasicApiKeyAuthPlugin', () => {
  let plugin: BasicApiKeyAuthPlugin;
  let mockContext: IRequestContext;

  beforeEach(async () => {
    plugin = new BasicApiKeyAuthPlugin();
    mockContext = createMockRequestContext();
  });

  describe('Configuration', () => {
    it('should configure with valid API keys', async () => {
      // test body
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      await plugin.configure({
        apikeys: ['valid-key-1', 'valid-key-2']
      });
    });

    describe('Authorization Header', () => {
      it('should accept valid API key in Authorization header', async () => {
        // test body
      });
    });
  });
});
```

**Patterns:**
- `describe()` blocks organize tests by feature/concern
- Nested describe blocks for sub-features and edge cases
- `beforeEach()` setup common test data (local scope preferred)
- `beforeAll()` for expensive setup (file I/O, external services)
- Each `it()` statement tests one behavior

## Mocking

**Framework:** Jest built-in mocking with `jest.fn()`, `jest.mock()`, HTTP mocking via nock

**HTTP Mocking via nock:**
- Used in setup file for intercepting HTTP requests
- Global setup ensures clean state: `nock.cleanAll()` in `beforeEach()`
- Warnings for unused interceptors: checks `nock.isDone()` in `afterEach()`

**Example** (from `packages/core/tests/setup.ts`):
```typescript
import nock from 'nock';

beforeEach(() => {
  // Clear all nock interceptors before each test
  nock.cleanAll();
});

afterEach(() => {
  // Ensure all HTTP mocks were used
  if (!nock.isDone()) {
    console.warn('Unused nock interceptors:', nock.pendingMocks());
    nock.cleanAll();
  }
});

afterAll(() => {
  nock.restore();
});
```

**Jest Mock Functions:**
```typescript
// From MockPlugin fixture
this.callTracker = {
  beforeModel: jest.fn().mockResolvedValue(options.beforeModelResult || { success: true }),
  afterModel: jest.fn().mockResolvedValue(options.afterModelResult || { success: true }),
  // Mock can be configured to throw
  somethingElse: jest.fn().mockRejectedValue(new Error('Mock error'))
};
```

**Patterns:**
- Mock functions created in test setup
- Methods return jest.Mock instances for call tracking
- Use `mockResolvedValue()` for async success paths
- Use `mockRejectedValue()` for async error paths
- Call history inspected via `.mock.calls`: `this.callTracker.beforeModel.mock.calls.length`

**What to Mock:**
- External HTTP requests (nock)
- Plugin implementations (jest.fn with MockPlugin)
- Logger calls (no explicit mocking; logger methods don't throw)
- Date/time (implicit via test data)

**What NOT to Mock:**
- Core business logic under test (instantiate actual classes)
- Type/interface definitions (use real types)
- Config loading and validation (test with real YAML/JSON files)
- Logger class itself (test with real Winston logger)

## Fixtures and Factories

**Test Data:**
```typescript
// From packages/core/tests/fixtures/mockPlugin.ts
export function createMockRequestContext(overrides: Partial<IRequestContext> = {}): IRequestContext {
  return {
    project: 'test-project',
    adapter: 'openai',
    request_id: 'test-request-123',
    request: {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello, world!' }],
      max_tokens: 100,
      temperature: 0.7,
      stream: false,
      target_provider: 'openai'
    },
    available_models: ['gpt-3.5-turbo', 'gpt-4'],
    plugin_data: new Map(),
    metrics: { start_time: new Date() },
    headers: { 'content-type': 'application/json' },
    query_params: {},
    metadata: {},
    retry_count: 0,
    httpRequest: {
      method: 'POST',
      url: '/openai/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
      body: { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Hello, world!' }] }
    },
    ...overrides
  };
}
```

**Factory Pattern:**
```typescript
// From packages/core/tests/fixtures/mockPlugin.ts
export class MockPlugin implements IPlugin {
  constructor(name: string = 'mock-plugin', options: {
    beforeModelResult?: IPluginResult;
    shouldThrow?: string[];
  } = {}) {
    // Configurable mock with overrides
  }

  // Helper methods for test assertions
  reset() { /* clear mocks */ }
  getCallCounts() { /* return call counts */ }
  getLastCallArgs(method: keyof MockPluginCallTracker) { /* return args */ }
}
```

**Location:**
- `packages/core/tests/fixtures/mockPlugin.ts` - Mock plugin implementations
- `packages/core/tests/fixtures/mockResponses.ts` - Mock API responses
- Fixtures imported directly: `import { createMockRequestContext } from '../../fixtures/mockPlugin'`

## Coverage

**Requirements:**
- Not enforced in config (no `coverageThreshold`)
- `collectCoverageFrom` configured for `src/**/*.{ts,tsx}` excluding `.d.ts` files

**View Coverage:**
```bash
npm run test:coverage          # Generate coverage report
# Output: coverage/ directory with HTML report
```

**Jest Config** (from `packages/core/jest.config.js`):
```javascript
collectCoverageFrom: [
  'src/**/*.{ts,tsx}',
  '!src/**/*.d.ts',
  '!src/**/*.js',
  '!src/**/*.js.map'
],
coverageDirectory: 'coverage',
coverageReporters: ['text', 'lcov', 'html']
```

## Test Types

**Unit Tests:**
- Location: `packages/core/tests/unit/`
- Scope: Test individual classes/functions in isolation
- Dependencies mocked: External APIs, other services
- Examples: `plugins/basicApiKeyAuthPlugin.test.ts`, `utils/logger.test.ts`, `providers/providerRegistry.test.ts`
- Characteristics: Fast execution, deterministic results, focused on single behavior

**Integration Tests:**
- Location: `packages/core/tests/integration/`
- Scope: Test components working together (e.g., Express app, plugin system, adapters)
- Dependencies real or stubbed: Mock HTTP via nock, real config parsing
- Example: `gateway.test.ts` - Tests Express app with middleware stack
- Characteristics: Slower, test interaction between layers

**E2E Tests:**
- Location: `packages/core/tests/e2e/`
- Scope: End-to-end flow testing (complete request/response cycles)
- Dependencies: Mock external services, real internal logic
- Example: `streaming.test.ts`
- Characteristics: Full workflow validation, streaming response handling

## Common Patterns

**Async Testing:**
```typescript
it('should configure with valid API keys', async () => {
  const config = { apikeys: ['valid-key-1', 'valid-key-2'] };
  await expect(plugin.configure(config)).resolves.not.toThrow();
});

it('should throw error for unknown provider type', async () => {
  await expect(
    providerRegistry.createProvider('unknown', {})
  ).rejects.toThrow();
});
```

**Error Testing:**
```typescript
it('should reject invalid API key in Authorization header', async () => {
  mockContext.httpRequest.headers['authorization'] = 'invalid-key';
  const result = await plugin.beforeModel(mockContext);

  expect(result.success).toBe(false);
  expect(result.terminate).toBe(true);
  expect(result.status).toBe(401);
  expect(result.error).toBeInstanceOf(Error);
  expect(result.error?.message).toBe('Unauthorized: Invalid API key');
});
```

**Property Matching:**
```typescript
expect(response.body).toMatchObject({
  status: 'healthy',
  timestamp: expect.any(String),
  version: expect.any(String)
});

expect(response.body).toHaveProperty('id');
expect(response.body).toHaveProperty('object');
```

**Mock Call Assertions:**
```typescript
expect(this.callTracker.beforeModel).toHaveBeenCalledTimes(1);
expect(this.callTracker.beforeModel.mock.calls[0][0]).toEqual(expectedContext);
expect(plugin.getCallCounts().beforeModel).toBe(1);
```

## Custom Matchers

**Extended Matchers** (from `packages/core/tests/setup.ts`):
```typescript
// Custom matcher for LLM responses
expect.extend({
  toBeValidLLMResponse(received) {
    const pass = received &&
      typeof received.id === 'string' &&
      typeof received.object === 'string' &&
      typeof received.created === 'number' &&
      Array.isArray(received.content) &&
      received.usage &&
      typeof received.usage.prompt_tokens === 'number';

    return {
      message: () => `expected ${received} to be a valid LLM response`,
      pass
    };
  }
});

// Custom matcher for metrics
expect.extend({
  toHaveValidMetrics(received) {
    const pass = received &&
      received.start_time instanceof Date &&
      typeof received.duration_ms === 'number' &&
      typeof received.input_tokens === 'number';

    return {
      message: () => `expected ${received} to have valid metrics`,
      pass
    };
  }
});
```

**Usage:**
```typescript
expect(response).toBeValidLLMResponse();
expect(metrics).toHaveValidMetrics();
```

## Jest Configuration

**Key Settings** (from `packages/core/jest.config.js`):
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx)',
    '**/*.(test|spec).+(ts|tsx)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 30000,
  verbose: true
};
```

---

*Testing analysis: 2026-01-21*
