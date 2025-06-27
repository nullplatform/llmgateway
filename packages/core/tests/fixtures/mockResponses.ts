import { ILLMResponse, ILLMRequest } from '@nullplatform/llm-gateway-sdk';

export const mockOpenAIRequest: ILLMRequest = {
  model: 'gpt-3.5-turbo',
  messages: [
    {
      role: 'user',
      content: 'Hello, world!'
    }
  ],
  max_tokens: 100,
  temperature: 0.7,
  stream: false,
  target_provider: 'openai'
};

export const mockOpenAIResponse: ILLMResponse = {
  id: 'chatcmpl-test123',
  object: 'chat.completion',
  created: 1638360000,
  model: 'gpt-3.5-turbo',
  content: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello! How can I help you today?'
      },
      finish_reason: 'stop'
    }
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30
  }
};

export const mockAnthropicRequest: ILLMRequest = {
  model: 'claude-3-sonnet-20240229',
  messages: [
    {
      role: 'user',
      content: 'Hello, Claude!'
    }
  ],
  max_tokens: 100,
  temperature: 0.7,
  stream: false,
  target_provider: 'anthropic'
};

export const mockAnthropicResponse: ILLMResponse = {
  id: 'msg_test123',
  object: 'chat.completion',
  created: 1638360000,
  model: 'claude-3-sonnet-20240229',
  content: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello! I\'m Claude. How can I assist you?'
      },
      finish_reason: 'stop'
    }
  ],
  usage: {
    prompt_tokens: 12,
    completion_tokens: 25,
    total_tokens: 37
  }
};

export const mockStreamingChunk: Partial<ILLMResponse> = {
  id: 'chatcmpl-test123',
  object: 'chat.completion.chunk',
  created: 1638360000,
  model: 'gpt-3.5-turbo',
  content: [
    {
      index: 0,
      delta: {
        role: 'assistant',
        content: 'Hello'
      }
    }
  ]
};

export const mockGatewayConfig = {
  server: {
    host: 'localhost',
    port: 3000,
    cors: {
      enabled: true,
      origins: ['*']
    }
  },
  logging: {
    level: 'info'
  },
  maxRetries: 3,
  defaultProject: true,
  models: {
    'gpt-3.5-turbo': {
      provider: 'openai',
      config: {
        apiKey: 'mock-api-key'
      }
    },
    'claude-3-sonnet': {
      provider: 'anthropic',
      config: {
        apiKey: 'mock-anthropic-key'
      }
    }
  },
  plugins: [],
  availableExtensions: [],
  projects: []
};