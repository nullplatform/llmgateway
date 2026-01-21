import { ILLMPlugin, IRequestContext, ILLMPluginResult } from '@nullplatform/llm-gateway-sdk';

export interface MockPluginCallTracker {
  beforeModel: jest.Mock;
  afterModel: jest.Mock;
  afterChunk: jest.Mock;
  onModelError: jest.Mock;
  detachedAfterResponse: jest.Mock;
}

export class MockPlugin implements ILLMPlugin {
  name: string;
  version: string;
  description: string;
  callTracker: MockPluginCallTracker;

  constructor(name: string = 'mock-plugin', options: {
    beforeModelResult?: ILLMPluginResult;
    afterModelResult?: ILLMPluginResult;
    afterChunkResult?: ILLMPluginResult;
    onModelErrorResult?: ILLMPluginResult;
    shouldThrow?: string[]; // Array of method names that should throw
  } = {}) {
    this.name = name;
    this.version = '1.0.0';
    this.description = 'Mock plugin for testing';

    // Create mock functions with default implementations
    this.callTracker = {
      beforeModel: jest.fn().mockResolvedValue(options.beforeModelResult || { success: true, context: {} }),
      afterModel: jest.fn().mockResolvedValue(options.afterModelResult || { success: true, context: {} }),
      afterChunk: jest.fn().mockResolvedValue(options.afterChunkResult || { success: true, context: {} }),
      onModelError: jest.fn().mockResolvedValue(options.onModelErrorResult || { success: true, context: {} }),
      detachedAfterResponse: jest.fn()
    };

    // Configure methods to throw if specified
    if (options.shouldThrow) {
      options.shouldThrow.forEach(methodName => {
        if (this.callTracker[methodName as keyof MockPluginCallTracker]) {
          (this.callTracker[methodName as keyof MockPluginCallTracker] as jest.Mock)
            .mockRejectedValue(new Error(`Mock error in ${methodName}`));
        }
      });
    }
  }

  configure(config: any): Promise<void> {
        throw new Error('Method not implemented.');
    }
    validateConfig?(config: any): Promise<boolean | string> {
        throw new Error('Method not implemented.');
    }

  async beforeModel(context: IRequestContext): Promise<ILLMPluginResult> {
    return this.callTracker.beforeModel(context);
  }

  async afterModel(context: IRequestContext): Promise<ILLMPluginResult> {
    return this.callTracker.afterModel(context);
  }

  async afterChunk(context: IRequestContext): Promise<ILLMPluginResult> {
    return this.callTracker.afterChunk(context);
  }

  async onModelError(context: IRequestContext): Promise<ILLMPluginResult> {
    return this.callTracker.onModelError(context);
  }

  async detachedAfterResponse(context: IRequestContext): Promise<void> {
    this.callTracker.detachedAfterResponse(context);
  }

  // Helper methods for testing
  reset() {
    Object.values(this.callTracker).forEach(mock => {
      if (typeof mock.mockClear === 'function') {
        mock.mockClear();
      }
    });
  }

  getCallCounts() {
    return {
      beforeModel: this.callTracker.beforeModel.mock.calls.length,
      afterModel: this.callTracker.afterModel.mock.calls.length,
      afterChunk: this.callTracker.afterChunk.mock.calls.length,
      onModelError: this.callTracker.onModelError.mock.calls.length,
      detachedAfterResponse: this.callTracker.detachedAfterResponse.mock.calls.length
    };
  }

  getLastCallArgs(method: keyof MockPluginCallTracker) {
    const calls = this.callTracker[method].mock.calls;
    return calls.length > 0 ? calls[calls.length - 1] : null;
  }
}

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
    headers: {
      'content-type': 'application/json',
      'user-agent': 'test-client'
    },
    query_params: {},
    metadata: {},
    retry_count: 0,
    httpRequest: {
      method: 'POST',
      url: '/openai/v1/chat/completions',
      headers: {
        'content-type': 'application/json'
      },
      body: {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, world!' }]
      }
    },
    ...overrides
  };
}