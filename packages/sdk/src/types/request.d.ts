export interface IMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    tool_calls?: IToolCall[];
    tool_call_id?: string;
}
export interface IToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export interface ILLMRequest {
    messages: IMessage[];
    model: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
    stream?: boolean;
    tools?: ITool[];
    tool_choice?: 'none' | 'auto' | {
        type: 'function';
        function: {
            name: string;
        };
    };
    target_provider: string;
    metadata?: {
        user_id?: string;
        session_id?: string;
        experiment_id?: string;
        original_provider?: string;
        custom?: Record<string, any>;
    };
}
export interface ITool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, any>;
    };
}
export interface ILLMResponse {
    id: string;
    object: 'chat.completion' | 'chat.completion.chunk';
    created: number;
    model: string;
    choices: IChoice[];
    usage?: IUsage;
    system_fingerprint?: string;
}
export interface IChoice {
    index: number;
    message?: IMessage;
    delta?: Partial<IMessage>;
    logprobs?: any;
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}
export interface IUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
        cached_tokens?: number;
    };
    completion_tokens_details?: {
        reasoning_tokens?: number;
    };
}
export interface StreamChunk {
    id: string;
    object: 'chat.completion.chunk';
    created: number;
    model: string;
    choices: {
        index: number;
        delta: Partial<IMessage>;
        finish_reason?: string | null;
    }[];
    usage?: IUsage;
}
//# sourceMappingURL=request.d.ts.map