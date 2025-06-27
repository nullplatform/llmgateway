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

export interface AnthropicRequest {
    model: string;
    max_tokens: number;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string | Array<{
            type: 'text' | 'tool_use' | 'tool_result';
            text?: string;
            id?: string;
            name?: string;
            input?: any;
            content?: string;
            tool_use_id?: string;
        }>;
    }>;
    system?: string;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop_sequences?: string[];
    stream?: boolean;
    tools?: Array<{
        name: string;
        description: string;
        input_schema: Record<string, any>;
    }>;
    tool_choice?: {
        type: 'auto' | 'any' | 'tool';
        name?: string;
        disable_parallel_tool_use?: boolean;
    };
    metadata?: {
        user_id?: string;
    };
}

export interface AnthropicResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<{
        type: 'text' | 'tool_use';
        text?: string;
        id?: string;
        name?: string;
        input?: any;
    }>;
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    stop_sequence?: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

interface StreamingState {
    hasStarted: boolean;
    blockStarted: boolean;
    toolBlocksStarted: Set<string>;
    contentBlockIndex: number;
    lastToolCallId?: string;
    finishReason?: string;
}
@ExtensionMetadata({
    name: 'anthropic',
    description: 'Anthropic API adapter for LLM Gateway',
})
export class AnthropicApiAdapter implements ILLMApiAdapter<AnthropicRequest, AnthropicResponse> {



    readonly name = 'anthropic';
    readonly basePaths = ['/v1/messages', '/messages'];
    private streamingStateMap = new Map<string, StreamingState>();

    configure(config: any): Promise<void> {
        //Do nothing for now, as no configuration is needed
        return;
    }

    async transformInput(request: AnthropicRequest): Promise<ILLMRequest> {
        // Validate required fields
        if (!request.model) {
            throw new Error('Model is required');
        }

        if (!request.max_tokens) {
            throw new Error('max_tokens is required for Anthropic API');
        }

        if (!Array.isArray(request.messages) || request.messages.length === 0) {
            throw new Error('Messages array is required and must be non-empty');
        }

        // Transform Anthropic messages to LLM format
        const messages = this.transformAnthropicMessagesToLLM(request.messages, request.system);

        // Map tools if present
        const tools: ITool[] | undefined = request.tools?.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema
            }
        }));

        // Transform tool_choice
        let tool_choice: 'none' | 'auto' | undefined;
        if (request.tool_choice) {
            switch (request.tool_choice.type) {
                case 'auto':
                    tool_choice = 'auto';
                    break;
                case 'any':
                case 'tool':
                    tool_choice = 'auto'; // Map to closest equivalent
                    break;
                default:
                    tool_choice = 'auto';
            }
        }

        // Construct metadata
        const metadata: ILLMRequest['metadata'] = {
            user_id: request.metadata?.user_id,
            original_provider: 'anthropic',
            custom: {
                top_k: request.top_k,
                tool_choice: request.tool_choice,
                system: request.system
            }
        };

        // Build final LLMRequest
        const llmRequest: ILLMRequest = {
            messages,
            model: request.model,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p,
            stop: request.stop_sequences,
            stream: request.stream,
            tools,
            tool_choice,
            target_provider: "",
            metadata
        };

        return llmRequest;
    }

    async validate(request: any): Promise<string | null> {
        if (!request.model || typeof request.model !== 'string') {
            return 'Model must be a non-empty string';
        }

        if (!request.max_tokens || typeof request.max_tokens !== 'number' || request.max_tokens < 1) {
            return 'max_tokens must be a positive number';
        }

        if (!request.messages || !Array.isArray(request.messages)) {
            return 'Messages must be an array';
        }

        if (request.messages.length === 0) {
            return 'Messages array cannot be empty';
        }

        // Validate each message
        for (const [index, message] of request.messages.entries()) {
            if (!message.role || !['user', 'assistant'].includes(message.role)) {
                return `Message ${index}: role must be one of: user, assistant`;
            }

            if (!message.content) {
                return `Message ${index}: content is required`;
            }

            // Validate content structure
            if (Array.isArray(message.content)) {
                for (const [contentIndex, contentBlock] of message.content.entries()) {
                    if (!contentBlock.type || !['text', 'tool_use', 'tool_result'].includes(contentBlock.type)) {
                        return `Message ${index}, content ${contentIndex}: type must be one of: text, tool_use, tool_result`;
                    }
                }
            } else if (typeof message.content !== 'string') {
                return `Message ${index}: content must be a string or array of content blocks`;
            }
        }

        // Validate temperature
        if (request.temperature !== undefined) {
            if (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 1) {
                return 'Temperature must be a number between 0 and 1';
            }
        }

        // Validate top_p
        if (request.top_p !== undefined) {
            if (typeof request.top_p !== 'number' || request.top_p < 0 || request.top_p > 1) {
                return 'top_p must be a number between 0 and 1';
            }
        }

        return null; // No validation errors
    }

    async getContentBlockFinish(idx): Promise<string> {
        return `event: content_block_stop\ndata: {"type":"content_block_stop","index":${idx}         }\n\n`;
    }


    async transformOutputChunk(
        processedInput: ILLMRequest,
        input: AnthropicRequest,
        chunk: ILLMResponse,
        firstChunk: boolean,
        finalChunk: boolean,
        accumulated: ILLMResponse
    ): Promise<Buffer> {
        let response = "";
        const requestId = chunk?.id || accumulated?.id || 'unknown';

        // Initialize or get streaming state for this request
        if (!this.streamingStateMap.has(requestId)) {
            this.streamingStateMap.set(requestId, {
                hasStarted: false,
                blockStarted: false,
                toolBlocksStarted: new Set(),
                contentBlockIndex: 0,
                lastToolCallId: undefined
            });
        }

        const state = this.streamingStateMap.get(requestId)!;

        if (chunk) {
            const choice = chunk.content?.[0];

            // Handle message_start (only once per request)
            if (!state.hasStarted) {
                response += `event: message_start\n`;
                response += `data: ${JSON.stringify({
                    type: "message_start",
                    message: {
                        id: requestId,
                        type: "message",
                        role: "assistant",
                        model: chunk.model || input.model,
                        content: [],
                        stop_reason: null,
                        stop_sequence: null,
                        usage: {
                            input_tokens: chunk?.usage?.prompt_tokens || 0,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0,
                            output_tokens: chunk?.usage?.completion_tokens || 0,
                            service_tier: "standard"
                        } 
                    }
                })}\n\n`;
                state.hasStarted = true;
            }

            // Handle content_block_start for text content
            if (choice?.delta?.content !== undefined && !state.blockStarted) {
                response += `event: content_block_start\n`;
                response += `data: ${JSON.stringify({
                    type: "content_block_start",
                    index: state.contentBlockIndex,
                    content_block: {
                        type: "text",
                        text: ""
                    }
                })}\n\n`;
                state.blockStarted = true;
            }

            // Handle content_block_start for tool calls
            if (choice?.delta?.tool_calls) {
                const toolCall = choice.delta.tool_calls[0];
                if (toolCall?.id && !state.toolBlocksStarted.has(toolCall.id)) {
                    if(state.blockStarted) {
                        // Increment contentBlockIndex if text block was started
                        state.blockStarted = false;
                        response += await this.getContentBlockFinish(state.contentBlockIndex++);
                    }
                    state.blockStarted = true;
                    response += `event: content_block_start\n`;
                    response += `data: ${JSON.stringify({
                        type: "content_block_start",
                        index: state.contentBlockIndex,
                        content_block: {
                            type: "tool_use",
                            id: toolCall.id,
                            name: toolCall.function?.name || "",
                            input: {}
                        }
                    })}\n\n`;
                    state.toolBlocksStarted.add(toolCall.id);
                    state.lastToolCallId = toolCall.id;
                }
            }

            // Handle content_block_delta for text
            if (choice?.delta?.content) {
                response += `event: content_block_delta\n`;
                response += `data: ${JSON.stringify({
                    type: "content_block_delta",
                    index: 0, // Text is always first content block
                    delta: {
                        type: "text_delta",
                        text: choice.delta.content
                    }
                })}\n\n`;
            }

            // Handle content_block_delta for tool calls
            if (choice?.delta?.tool_calls) {
                const toolCall = choice.delta.tool_calls[0];

                if (toolCall?.function?.arguments) {
                    response += `event: content_block_delta\n`;
                    response += `data: ${JSON.stringify({
                        type: "content_block_delta",
                        index: state.contentBlockIndex,
                        delta: {
                            type: "input_json_delta",
                            partial_json: toolCall.function.arguments
                        }
                    })}\n\n`;
                }
            }

            // Handle content_block_stop when finishing text or tool
            if (choice?.finish_reason && state.contentBlockIndex > 0) {
                state.blockStarted = false;
                response += await this.getContentBlockFinish(state.contentBlockIndex++);
            }


            // Handle message_delta for usage and stop_reason updates
            if (choice?.finish_reason) {
                state.finishReason = choice.finish_reason;
            }

            // Add ping events occasionally (optional, for keeping connection alive)
            if (Math.random() < 0.1) { // 10% chance
                response += `event: ping\n`;
                response += `data: ${JSON.stringify({ type: "ping" })}\n\n`;
            }
        }

        if (finalChunk) {
            if(state.blockStarted) {
                state.blockStarted = false;
                response += await this.getContentBlockFinish(state.contentBlockIndex++);
            }
            response += `event: message_delta\n`;
            response += `data: ${JSON.stringify({
                type: "message_delta",
                delta: {
                    stop_reason: this.mapFinishReasonToAnthropic(state.finishReason),
                    stop_sequence: null
                },
                usage: {
                    output_tokens: accumulated?.usage?.completion_tokens || 0
                } 
            })}\n\n`;
            response += `event: message_stop\n`;
            response += `data: ${JSON.stringify({
                type: "message_stop"
            })}\n\n`;

            // Clean up streaming state
            this.streamingStateMap.delete(requestId);
        }

        return Buffer.from(response);
    }

    private mapFinishReasonToAnthropic(finishReason?: string): string | null {
        switch (finishReason) {
            case 'stop':
                return 'end_turn';
            case 'length':
                return 'max_tokens';
            case 'tool_calls':
                return 'tool_use';
            default:
                return null;
        }
    }

    async transformOutput(
        processedInput: ILLMRequest,
        input: AnthropicRequest,
        response: ILLMResponse
    ): Promise<AnthropicResponse> {
        const choice = response.content[0];
        const content: AnthropicResponse['content'] = [];

        // Handle text content
        if (choice.message?.content) {
            content.push({
                type: 'text',
                text: choice.message.content
            });
        }

        // Handle tool calls
        if (choice.message?.tool_calls) {
            for (const toolCall of choice.message.tool_calls) {
                content.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: typeof toolCall.function.arguments === 'string'
                        ? JSON.parse(toolCall.function.arguments)
                        : toolCall.function.arguments
                });
            }
        }

        // Map finish reason
        let stop_reason: AnthropicResponse['stop_reason'] = 'end_turn';
        switch (choice.finish_reason) {
            case 'stop':
                stop_reason = 'end_turn';
                break;
            case 'length':
                stop_reason = 'max_tokens';
                break;
            case 'tool_calls':
                stop_reason = 'tool_use';
                break;
            default:
                stop_reason = 'end_turn';
        }

        const transformed: AnthropicResponse = {
            id: response.id,
            type: 'message',
            role: 'assistant',
            content,
            model: response.model,
            stop_reason,
            usage: {
                input_tokens: response.usage?.prompt_tokens || 0,
                output_tokens: response.usage?.completion_tokens || 0
            }
        };

        return transformed;
    }

    private transformAnthropicMessagesToLLM(
        anthropicMessages: AnthropicRequest['messages'],
        systemMessage?: string
    ): ILLMRequest['messages'] {
        const messages: ILLMRequest['messages'] = [];

        // Add system message if present
        if (systemMessage) {
            messages.push({
                role: 'system',
                content: systemMessage
            });
        }

        // Transform each Anthropic message
        for (const msg of anthropicMessages) {
            if (typeof msg.content === 'string') {
                // Simple text message
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                });
            } else if (Array.isArray(msg.content)) {
                // Complex content with multiple blocks
                for (const contentBlock of msg.content) {
                    if (contentBlock.type === 'text') {
                        messages.push({
                            role: msg.role === 'user' ? 'user' : 'assistant',
                            content: contentBlock.text || ''
                        });
                    } else if (contentBlock.type === 'tool_use') {
                        messages.push({
                            role: 'assistant',
                            content: '',
                            tool_calls: [{
                                id: contentBlock.id || '',
                                type: 'function',
                                function: {
                                    name: contentBlock.name || '',
                                    arguments: JSON.stringify(contentBlock.input || {})
                                }
                            }]
                        });
                    } else if (contentBlock.type === 'tool_result') {
                        messages.push({
                            role: 'tool',
                            content: contentBlock.content || '',
                            tool_call_id: contentBlock.tool_use_id
                        });
                    }
                }
            }
        }

        return messages;
    }

    async getNativeAdapters(): Promise<INativeAdapter[]> {
        return [
            {
                path: "/models",
                method: 'get',
                doRequest: async (request: IHTTPRequest, response: IHTTPResponse) => {
                    response.json({
                        "data": [
                            {
                                "id": "claude-3-5-sonnet-20241022",
                                "type": "model",
                                "display_name": "Claude 3.5 Sonnet"
                            },
                            {
                                "id": "claude-3-5-haiku-20241022",
                                "type": "model",
                                "display_name": "Claude 3.5 Haiku"
                            },
                            {
                                "id": "claude-3-opus-20240229",
                                "type": "model",
                                "display_name": "Claude 3 Opus"
                            },
                            {
                                "id": "claude-3-sonnet-20240229",
                                "type": "model",
                                "display_name": "Claude 3 Sonnet"
                            },
                            {
                                "id": "claude-3-haiku-20240307",
                                "type": "model",
                                "display_name": "Claude 3 Haiku"
                            }
                        ]
                    });
                }
            }
        ];
    }
}