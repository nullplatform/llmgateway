import { IProvider, IProviderFactory, IProviderRegistry } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import { GatewayConfig } from "../config/gatewayConfig";
export declare class ProviderRegistry implements IProviderRegistry {
    private factories;
    private logger;
    constructor(config: GatewayConfig, logger?: Logger);
    private registerBuiltInFactories;
    registerFactory(factory: IProviderFactory): void;
    getFactory(type: string): IProviderFactory | undefined;
    listFactories(): IProviderFactory[];
    createProvider(type: string, config: any, logger?: Logger): IProvider;
    getAvailableProviderTypes(): string[];
}
//# sourceMappingURL=providerRegistry.d.ts.map