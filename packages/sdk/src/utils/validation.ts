// packages/sdk/src/utils/validation.ts

import { ILLMRequest, IMessage } from '../types/request.js';

export class ValidationError extends Error {
    constructor(message: string, public field?: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export function validateLLMRequest(request: ILLMRequest): void {
    if (!request.model || typeof request.model !== 'string') {
        throw new ValidationError('Model must be a non-empty string', 'model');
    }

    if (!request.messages || !Array.isArray(request.messages)) {
        throw new ValidationError('Messages must be an array', 'messages');
    }

    if (request.messages.length === 0) {
        throw new ValidationError('Messages array cannot be empty', 'messages');
    }

    request.messages.forEach((message, index) => {
        validateMessage(message, `messages[${index}]`);
    });

    if (request.temperature !== undefined) {
        if (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 2) {
            throw new ValidationError('Temperature must be a number between 0 and 2', 'temperature');
        }
    }

    if (request.max_tokens !== undefined) {
        if (typeof request.max_tokens !== 'number' || request.max_tokens < 1) {
            throw new ValidationError('max_tokens must be a positive number', 'max_tokens');
        }
    }

    if (request.top_p !== undefined) {
        if (typeof request.top_p !== 'number' || request.top_p < 0 || request.top_p > 1) {
            throw new ValidationError('top_p must be a number between 0 and 1', 'top_p');
        }
    }
}

export function validateMessage(message: IMessage, fieldPath: string = 'message'): void {
    if (!message.role || !['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        throw new ValidationError(
            'Role must be one of: system, user, assistant, tool',
            `${fieldPath}.role`
        );
    }

    if (!message.content || typeof message.content !== 'string') {
        throw new ValidationError(
            'Content must be a non-empty string',
            `${fieldPath}.content`
        );
    }

    if (message.role === 'tool' && !message.tool_call_id) {
        throw new ValidationError(
            'Tool messages must have tool_call_id',
            `${fieldPath}.tool_call_id`
        );
    }

    if (message.tool_calls) {
        message.tool_calls.forEach((toolCall, index) => {
            validateToolCall(toolCall, `${fieldPath}.tool_calls[${index}]`);
        });
    }
}

export function validateToolCall(toolCall: any, fieldPath: string = 'tool_call'): void {
    if (!toolCall.id || typeof toolCall.id !== 'string') {
        throw new ValidationError('Tool call must have an id', `${fieldPath}.id`);
    }

    if (toolCall.type !== 'function') {
        throw new ValidationError('Tool call type must be "function"', `${fieldPath}.type`);
    }

    if (!toolCall.function) {
        throw new ValidationError('Tool call must have function object', `${fieldPath}.function`);
    }

    if (!toolCall.function.name || typeof toolCall.function.name !== 'string') {
        throw new ValidationError('Function must have a name', `${fieldPath}.function.name`);
    }

    if (!toolCall.function.arguments || typeof toolCall.function.arguments !== 'string') {
        throw new ValidationError('Function must have arguments (as string)', `${fieldPath}.function.arguments`);
    }

    // Validate that arguments is valid JSON
    try {
        JSON.parse(toolCall.function.arguments);
    } catch (error) {
        throw new ValidationError('Function arguments must be valid JSON', `${fieldPath}.function.arguments`);
    }
}

export function sanitizeRequest(request: ILLMRequest): ILLMRequest {
    return {
        ...request,
        messages: request.messages.map(msg => ({
            ...msg,
            content: msg.content.trim()
        })),
        // Remove undefined values
        temperature: request.temperature === undefined ? undefined : Math.max(0, Math.min(2, request.temperature)),
        max_tokens: request.max_tokens === undefined ? undefined : Math.max(1, Math.floor(request.max_tokens)),
        top_p: request.top_p === undefined ? undefined : Math.max(0, Math.min(1, request.top_p))
    };
}

export function isValidModel(model: string, availableModels: string[]): boolean {
    return availableModels.includes(model);
}

export function isValidProvider(provider: string, availableProviders: string[]): boolean {
    return availableProviders.includes(provider);
}