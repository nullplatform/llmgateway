import { ILLMApiAdapter, ILLMRequest, ILLMResponse } from '@nullplatform/llm-gateway-sdk';
export interface OpenAIRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
        name?: string;
        tool_calls?: Array<{
            id: string;
            type: 'function';
            function: {
                name: string;
                arguments: string;
            };
        }>;
        tool_call_id?: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
    stream?: boolean;
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters?: Record<string, any>;
        };
    }>;
    tool_choice?: 'none' | 'auto' | {
        type: 'function';
        function: {
            name: string;
        };
    };
    user?: string;
    logit_bias?: Record<string, number>;
    logprobs?: boolean;
    top_logprobs?: number;
    n?: number;
    response_format?: {
        type: 'text' | 'json_object';
    };
    seed?: number;
}
export interface OpenAIResponse {
    id: string;
    object: 'chat.completion' | 'chat.completion.chunk';
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message?: {
            role: 'system' | 'user' | 'assistant' | 'tool';
            content: string | null;
            name?: string;
            tool_calls?: Array<{
                id: string;
                type: 'function';
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        };
        delta?: {
            role?: 'system' | 'user' | 'assistant' | 'tool';
            content?: string | null;
            function_call?: {
                name?: string;
                arguments?: string;
            };
            tool_calls?: Array<{
                id: string;
                type: 'function';
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        };
        logprobs?: any;
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    system_fingerprint?: string;
}
export declare class OpenAIApiAdapter implements ILLMApiAdapter<OpenAIRequest, any> {
    readonly name = "openai";
    readonly basePaths: string[];
    transformInput(request: OpenAIRequest): Promise<ILLMRequest>;
    validate(request: any): Promise<string | null>;
    transformOutput(processedInput: ILLMRequest, input: OpenAIRequest, response: ILLMResponse): Promise<OpenAIResponse>;
}
//# sourceMappingURL=openai.d.ts.map