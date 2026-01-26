import {
    ExtensionMetadata,
    IHTTPRequest,
    IHTTPResponse,
    ILLMApiAdapter,
    ILLMRequest,
    ILLMResponse,
    INativeAdapter,
    ITool
} from '@nullplatform/llm-gateway-sdk';

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
    max_completion_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
    stream?: boolean;
    stream_options?: {
        include_usage?: boolean;
    }
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters?: Record<string, any>;
        };
    }>;
    tool_choice?: 'none' | 'auto';
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


@ExtensionMetadata({
    name: 'openai',
    description: 'OpenAI API adapter for LLM Gateway',
})
export class OpenAIApiAdapter implements ILLMApiAdapter<OpenAIRequest, OpenAIResponse> {


    readonly name = 'openai';
    readonly basePaths = ['/v1/chat/completions','/chat/completions'];

    configure(config: any): Promise<void> {
       //Do Nothing
       return;
    }

    async transformInput(request: OpenAIRequest): Promise<ILLMRequest> {
        // Validate required fields
        if (!request.model) {
            throw new Error('Model is required');
        }

        if (!Array.isArray(request.messages) || request.messages.length === 0) {
            throw new Error('Messages array is required and must be non-empty');
        }

        // Map messages to LLM format (no transformation needed unless normalization is required)
        const messages = request.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            name: msg.name,
            tool_calls: msg.tool_calls,
            tool_call_id: msg.tool_call_id
        }));

        // Map tools if present
        const tools: ITool[] | undefined = request.tools?.map(tool => ({
            type: tool.type,
            function: {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters
            }
        }));

        // Construct metadata, preserving custom OpenAI-specific values
        const metadata: ILLMRequest['metadata'] = {
            user_id: request.user,
            original_provider: 'openai',
            custom: {
                logit_bias: request.logit_bias,
                logprobs: request.logprobs,
                top_logprobs: request.top_logprobs,
                n: request.n,
                response_format: request.response_format,
                seed: request.seed
            }
        };

        // Build final LLMRequest
        const llmRequest: ILLMRequest = {
            messages,
            model: request.model,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p,
            frequency_penalty: request.frequency_penalty,
            presence_penalty: request.presence_penalty,
            stop: request.stop,
            stream: request.stream,
            tools,
            tool_choice: request.tool_choice,
            target_provider: "", // To be filled dynamically if not statically set
            metadata
        };

        return llmRequest;
    }


    async validate(request: any): Promise<string | null> {
        if (!request.model || typeof request.model !== 'string') {
            return 'Model must be a non-empty string';
        }

        if (!request.messages || !Array.isArray(request.messages)) {
            return 'Messages must be an array';
        }

        if (request.messages.length === 0) {
            return 'Messages array cannot be empty';
        }

        // Validate each message
        for (const [index, message] of request.messages.entries()) {
            if (!message.role || !['system', 'user', 'assistant', 'tool'].includes(message.role)) {
                return `Message ${index}: role must be one of: system, user, assistant, tool`;
            }

            if (!message.content || typeof message.content !== 'string') {
                return `Message ${index}: content must be a non-empty string`;
            }

            // Additional validations for tool messages
            if (message.role === 'tool' && !message.tool_call_id) {
                return `Message ${index}: tool messages must have tool_call_id`;
            }
        }

        // Validate temperature
        if (request.temperature !== undefined) {
            if (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 2) {
                return 'Temperature must be a number between 0 and 2';
            }
        }

        // Validate max_tokens
        if (request.max_tokens !== undefined) {
            if (typeof request.max_tokens !== 'number' || request.max_tokens < 1) {
                return 'max_tokens must be a positive number';
            }
        }

        return null; // No validation errors
    }


    async transformOutputChunk( processedInput: ILLMRequest,
                                input: OpenAIRequest,
                                chunk: ILLMResponse, firstChunk: boolean, finalChunk: boolean,
                                acummulated: ILLMResponse): Promise<Buffer> {
        let response = "";

        if(chunk) {
            response += `data: ${JSON.stringify({
                id: chunk.id,
                object: chunk.object,
                created: chunk.created,
                model: chunk.model,
                choices: chunk?.content ?  chunk.content.map((choice, index) => ({
                    index,
                    delta: {
                        role: firstChunk? 'assistant': null, //open ai streaming ever answer assistant
                        content: choice.delta?.tool_calls?.length > 0 ? null : choice.delta?.content || null,
                        tool_calls: choice.delta?.tool_calls?.map(tool => ({
                            id: tool.id,
                            type: tool.type,
                            index:  choice.delta?.tool_calls?.length - 1,
                            function: {
                                name: tool?.function?.name,
                                arguments: tool?.function?.arguments
                            }
                        }))
                    },
                    logprobs: choice.logprobs,
                    finish_reason: choice.finish_reason ?? null
                })) : undefined,
                usage: chunk.usage
            })}\n\n`;
        }


        if(finalChunk) {
            response += `data: [DONE]\n\n`;
        }
        return Buffer.from(response);
    }

    async transformOutput(
        processedInput: ILLMRequest,
        input: OpenAIRequest,
        response: ILLMResponse
    ): Promise<OpenAIResponse> {
        const messages = response.content.map((choice, index) => {
            let message;
            if(choice.message.tool_calls?.length > 0) {
                const tool_calls = choice.message.tool_calls?.map(tool => ({
                    id: tool.id,
                    type: 'function',
                    function: {
                        name: tool.function.name,
                        arguments: typeof tool.function.arguments === 'string'
                            ? tool.function.arguments
                            : JSON.stringify(tool.function.arguments)
                    }
                }));
                message= {
                    role: 'assistant',
                    content: null,
                    tool_calls
                }
            } else {
                message = {
                    role: choice.message.role,
                    content: choice.message.content ?? null,
                };
            }
            let messagesResp ={
                message,
            }

            return {
                index,
                ...messagesResp,
                logprobs: choice.logprobs,
                finish_reason: choice.finish_reason ?? null,
            }
        })
        const transformed: OpenAIResponse = {
            id: response.id,
            object: processedInput.stream ? 'chat.completion.chunk' : 'chat.completion',
            created: response.created,
            model: response.model,
            choices: messages,
            usage: response.usage,
            system_fingerprint: response.system_fingerprint,
        };

        return transformed;
    }

    async getNativeAdapters(): Promise<INativeAdapter[]> {
        return [
            {
                path:"/models",
                method: 'get',
                doRequest: async (request: IHTTPRequest, response: IHTTPResponse) => {
                    response.json({
                        "object": "list",
                        "data": [
                        {
                            "id": "gpt-4-0613",
                            "object": "model",
                            "created": 1686588896,
                            "owned_by": "openai"
                        },
                        {
                            "id": "gpt-4",
                            "object": "model",
                            "created": 1687882411,
                            "owned_by": "openai"
                        },
                        {
                            "id": "gpt-3.5-turbo",
                            "object": "model",
                            "created": 1677610602,
                            "owned_by": "openai"
                        },
                        {
                            "id": "gpt-4o-audio-preview-2025-06-03",
                            "object": "model",
                            "created": 1748908498,
                            "owned_by": "system"
                        },
                        {
                            "id": "gpt-4.1-nano",
                            "object": "model",
                            "created": 1744321707,
                            "owned_by": "system"
                        },
                        {
                            "id": "gpt-image-1",
                            "object": "model",
                            "created": 1745517030,
                            "owned_by": "system"
                        },
                        {
                            "id": "codex-mini-latest",
                            "object": "model",
                            "created": 1746673257,
                            "owned_by": "system"
                        },
                        {
                            "id": "gpt-4o-realtime-preview-2025-06-03",
                            "object": "model",
                            "created": 1748907838,
                            "owned_by": "system"
                        },
                        {
                            "id": "davinci-002",
                            "object": "model",
                            "created": 1692634301,
                            "owned_by": "system"
                        },
                        {
                            "id": "babbage-002",
                            "object": "model",
                            "created": 1692634615,
                            "owned_by": "system"
                        },
                        {
                            "id": "gpt-3.5-turbo-instruct",
                            "object": "model",
                            "created": 1692901427,
                            "owned_by": "system"
                        }
                        ]
                    })
                    }
            }
        ]
    }

}
