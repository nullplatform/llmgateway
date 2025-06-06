import { ILLMRequest, IMessage } from '../types/request.js';
export declare class ValidationError extends Error {
    field?: string;
    constructor(message: string, field?: string);
}
export declare function validateLLMRequest(request: ILLMRequest): void;
export declare function validateMessage(message: IMessage, fieldPath?: string): void;
export declare function validateToolCall(toolCall: any, fieldPath?: string): void;
export declare function sanitizeRequest(request: ILLMRequest): ILLMRequest;
export declare function isValidModel(model: string, availableModels: string[]): boolean;
export declare function isValidProvider(provider: string, availableProviders: string[]): boolean;
//# sourceMappingURL=validation.d.ts.map