import { IProvider, IProviderFactory, ILLMRequest, ILLMResponse } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
export interface AnthropicProviderConfig {
    bypassModel: boolean;
    baseUrl?: string;
    model?: string;
    apiKey: string;
    retryAttempts?: number;
    retryDelay?: number;
    version?: string;
    maxTokens?: number;
}
export declare class AnthropicProvider implements IProvider {
    readonly name = "anthropic";
    readonly config: AnthropicProviderConfig;
    private client;
    private logger;
    constructor(config: AnthropicProviderConfig, logger: Logger);
    private setupInterceptors;
    execute(request: ILLMRequest): Promise<ILLMResponse>;
    private transformToAnthropicRequest;
    private ensureAlternatingMessages;
    private transformToLLMResponse;
    private mapFinishReason;
    makeStreamRequest(request: ILLMRequest): Promise<ReadableStream>;
    private retryRequest;
    private transformError;
    private sanitizeRequest;
    private sleep;
}
export declare class AnthropicProviderFactory implements IProviderFactory<AnthropicProviderConfig> {
    readonly name = "Anthropic Provider Factory";
    readonly type = "anthropic";
    create(config: AnthropicProviderConfig, logger?: Logger): IProvider<AnthropicProviderConfig>;
}
//# sourceMappingURL=anthropic.d.ts.map