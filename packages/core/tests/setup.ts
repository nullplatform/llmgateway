import nock from 'nock';

// Global test setup
beforeAll(() => {
  // Setup environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
});

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
  // Clean up after all tests
  nock.restore();
});

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidLLMResponse(): R;
      toHaveValidMetrics(): R;
    }
  }
}


// Custom Jest matchers for LLM responses
expect.extend({
  toBeValidLLMResponse(received) {
    const pass = received && 
      typeof received.id === 'string' &&
      typeof received.object === 'string' &&
      typeof received.created === 'number' &&
      Array.isArray(received.content) &&
      received.usage &&
      typeof received.usage.prompt_tokens === 'number' &&
      typeof received.usage.completion_tokens === 'number';

    return {
      message: () => `expected ${received} to be a valid LLM response`,
      pass
    };
  },

  toHaveValidMetrics(received) {
    const pass = received &&
      received.start_time instanceof Date &&
      typeof received.duration_ms === 'number' &&
      typeof received.input_tokens === 'number' &&
      typeof received.output_tokens === 'number';

    return {
      message: () => `expected ${received} to have valid metrics`,
      pass
    };
  }
});