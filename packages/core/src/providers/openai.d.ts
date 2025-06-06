import { IProvider, IProviderFactory } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import { ILLMRequest } from "@acme/sdk";
export interface OpenAIProviderConfig {
    bypassModel: boolean;
    baseUrl?: string;
    model?: string;
    apiKey: string;
    retryAttempts?: number;
    retryDelay?: number;
}
export declare class OpenAIProvider implements IProvider {
    readonly name = "openai";
    readonly config: OpenAIProviderConfig;
    private client;
    private logger;
    constructor(config: OpenAIProviderConfig, logger: Logger);
    private setupInterceptors;
    execute(request: ILLMRequest): Promise<any>;
    makeStreamRequest(request: any): Promise<ReadableStream>;
    private retryRequest;
    private transformError;
    private sanitizeRequest;
    private sleep;
}
export declare class OpenAIProviderFactory implements IProviderFactory<OpenAIProviderConfig> {
    readonly name = "OpenAI Provider Factory";
    readonly type = "openai";
    create(config: OpenAIProviderConfig, logger?: Logger): IProvider<OpenAIProviderConfig>;
}
//# sourceMappingURL=openai.d.ts.map