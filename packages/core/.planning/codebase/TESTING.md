# Testing Patterns

**Analysis Date:** 2026-01-20

## Test Framework

**Runner:**
- Jest 29.0.0
- Config: `jest.config.js`

**Assertion Library:**
- Jest built-in matchers

**Run Commands:**
```bash
npm test                # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run test:unit      # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e       # End-to-end tests only
npm run test:ci        # CI mode with coverage, no watch
```

## Test File Organization

**Location:**
- Tests co-located by type in `tests/` directory at project root
- Structure: `tests/{unit,integration,e2e}/{feature}/{*.test.ts}`

**Naming:**
- `.test.ts` suffix for TypeScript test files
- Generated `.test.js` files from TypeScript compilation

**Structure:**
```
tests/
├── unit/
│   ├── plugins/
│   │   ├── basicApiKeyAuthPlugin.test.js
│   │   ├── modelRouterPlugin.test.js
│   │   ├── pluginManager.test.js
│   │   ├── promptManagerPlugin.test.js
│   │   └── plugins.simple.test.ts
│   └── ...
├── integration/
│   └── gateway.test.ts
├── e2e/
│   └── ...
├── fixtures/
│   ├── mockPlugin.ts
│   └── mockResponses.ts
└── setup.ts
```

## Test Structure

**Suite Organization:**
```typescript
// From tests/unit/plugins/plugins.simple.test.ts
describe('Plugin Tests - Simplified', () => {
  describe('BasicApiKeyAuthPlugin', () => {
    let plugin: BasicApiKeyAuthPlugin;

    beforeEach(() => {
      plugin = new BasicApiKeyAuthPlugin();
    });

    it('should create plugin instance', () => {
      expect(plugin).toBeDefined();
      expect(typeof plugin.beforeModel).toBe('function');
    });
  });

  describe('ModelRouterPlugin', () => {
    // Additional describe blocks for each feature
  });

  describe('Plugin Integration', () => {
    // Integration-level tests
  });
});
```

**Patterns:**
- Setup: `beforeEach()` for fixture initialization before each test
- Teardown: `afterEach()` handled globally in `tests/setup.ts` via nock cleanup
- Assertion: Jest matchers with descriptive test names
- Test naming: `it('should [action] [condition]')` pattern

**Global Setup (tests/setup.ts):**
```typescript
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise
});

beforeEach(() => {
  nock.cleanAll(); // Clear HTTP mocks
});

afterEach(() => {
  if (!nock.isDone()) {
    console.warn('Unused nock interceptors:', nock.pendingMocks());
    nock.cleanAll();
  }
});

afterAll(() => {
  nock.restore(); // Clean up mocking library
});
```

## Mocking

**Framework:** Nock (HTTP mocking)

**Jest.fn() for spies and mocks:** Used in `tests/fixtures/mockPlugin.ts`

**Patterns:**

HTTP request mocking with nock:
```typescript
// From tests/setup.ts
beforeEach(() => {
  nock.cleanAll();
});

afterEach(() => {
  if (!nock.isDone()) {
    console.warn('Unused nock interceptors:', nock.pendingMocks());
  }
});
```

Mock plugin creation:
```typescript
// From tests/fixtures/mockPlugin.ts
export class MockPlugin implements IPlugin {
  constructor(name: string = 'mock-plugin', options: {
    beforeModelResult?: IPluginResult;
    afterModelResult?: IPluginResult;
    shouldThrow?: string[]; // Methods that should throw
  } = {}) {
    this.callTracker = {
      beforeModel: jest.fn().mockResolvedValue(options.beforeModelResult || { success: true }),
      afterModel: jest.fn().mockResolvedValue(options.afterModelResult || { success: true }),
      // ... other methods
    };
  }
}
```

Mock request context builder:
```typescript
// From tests/fixtures/mockPlugin.ts
export function createMockRequestContext(
  overrides: Partial<IRequestContext> = {}
): IRequestContext {
  return {
    project: 'test-project',
    adapter: 'openai',
    request_id: 'test-request-123',
    request: { /* ... */ },
    available_models: ['gpt-3.5-turbo', 'gpt-4'],
    plugin_data: new Map(),
    metrics: { start_time: new Date() },
    // ... more defaults
    ...overrides
  };
}
```

**What to Mock:**
- HTTP external API calls: all provider requests mocked with nock
- Plugin execution results: MockPlugin returns configured results
- Logger: not explicitly mocked; output suppressed via LOG_LEVEL=error
- External services: HTTP endpoints intercepted by nock

**What NOT to Mock:**
- Class instantiation: real classes used in tests
- Local service methods: PluginManager, Logger, ConfigLoader executed as-is
- Type validation: real interface/type checking via TypeScript
- Data transformation: actual adapter transformations tested

## Fixtures and Factories

**Test Data:**

Request context factory (`tests/fixtures/mockPlugin.ts`):
```typescript
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
    metrics: {
      start_time: new Date()
    },
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

Response fixtures (`tests/fixtures/mockResponses.ts`):
- Contains mock LLM provider responses matching OpenAI and Anthropic response shapes
- Used in integration tests to validate response transformation

**Location:**
- `tests/fixtures/mockPlugin.ts` - Mock implementations and context builders
- `tests/fixtures/mockResponses.ts` - Response templates and fixtures

## Coverage

**Requirements:** None enforced; coverage not mentioned in CI configuration

**View Coverage:**
```bash
npm run test:coverage  # Generates HTML report in coverage/
```

**collectCoverageFrom** (from jest.config.js):
```javascript
collectCoverageFrom: [
  'src/**/*.{ts,tsx}',
  '!src/**/*.d.ts',
  '!src/**/*.js',
  '!src/**/*.js.map'
],
coverageDirectory: 'coverage',
coverageReporters: ['text', 'lcov', 'html'],
```

## Test Types

**Unit Tests:**
- Scope: Individual class methods and functions
- Approach: Isolated testing with mocked dependencies
- Location: `tests/unit/plugins/` and similar
- Example: `tests/unit/plugins/basicApiKeyAuthPlugin.test.js` - 210+ tests covering authentication, configuration, edge cases
- Coverage: Configuration validation, API key validation, header handling, edge cases (whitespace, special chars, long keys)

**Integration Tests:**
- Scope: Express middleware and request handling across multiple components
- Approach: Full Express app with mocked endpoints, real middleware execution
- Location: `tests/integration/gateway.test.ts`
- Example flow: request → middleware → routing → response validation
- Components tested together: health checks, request validation, error handling

**E2E Tests:**
- Framework: Jest configured for e2e, but limited examples found
- Location: `tests/e2e/` directory exists but sparse implementation
- Approach: Would test full gateway with real or stubbed external services

## Common Patterns

**Async Testing:**
```typescript
// From tests/unit/plugins/plugins.simple.test.ts line 19
it('should configure with API keys', async () => {
  const config = { apikeys: ['test-key-1', 'test-key-2'] };
  await expect(plugin.configure(config)).resolves.not.toThrow();
});

// Async plugin calls awaited before assertions
const result = await plugin.beforeModel(context);
expect(result.success).toBe(true);
```

**Error Testing:**
```typescript
// From tests/unit/plugins/basicApiKeyAuthPlugin.test.js line 52
it('should reject invalid API key', async () => {
  mockContext.httpRequest.headers['authorization'] = 'invalid-key';
  const result = await plugin.beforeModel(mockContext);
  expect(result.success).toBe(false);
  expect(result.terminate).toBe(true);
  expect(result.status).toBe(401);
  expect(result.error?.message).toBe('Unauthorized: Invalid API key');
});
```

**Mock spy verification:**
```typescript
// From tests/fixtures/mockPlugin.ts
getCallCounts() {
  return {
    beforeModel: this.callTracker.beforeModel.mock.calls.length,
    afterModel: this.callTracker.afterModel.mock.calls.length,
    onModelError: this.callTracker.onModelError.mock.calls.length
  };
}

getLastCallArgs(method: keyof MockPluginCallTracker) {
  const calls = this.callTracker[method].mock.calls;
  return calls.length > 0 ? calls[calls.length - 1] : null;
}
```

**Custom Jest matchers** (from tests/setup.ts):
```typescript
expect.extend({
  toBeValidLLMResponse(received) {
    const pass = received &&
      typeof received.id === 'string' &&
      typeof received.object === 'string' &&
      Array.isArray(received.content) &&
      received.usage &&
      typeof received.usage.prompt_tokens === 'number';

    return {
      message: () => `expected ${received} to be a valid LLM response`,
      pass
    };
  },

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

## Test Timeout

**Configuration** (jest.config.js):
```javascript
testTimeout: 30000  // 30 seconds for all tests
```

Reason: Accommodates async plugin execution, HTTP mocking delays, and external service simulation

## Test Discovery

**Pattern matching** (jest.config.js):
```javascript
testMatch: [
  '**/__tests__/**/*.+(ts|tsx)',
  '**/*.(test|spec).+(ts|tsx)'
]
```

Jest automatically discovers and runs tests matching either pattern.

---

*Testing analysis: 2026-01-20*
