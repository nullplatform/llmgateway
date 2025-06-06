import { IModel, IModelRegistry } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import { ProviderRegistry } from '../providers/providerRegistry.js';
import { GatewayConfig } from '../config/gatewayConfig.js';
export declare class ModelRegistry implements IModelRegistry {
    private models;
    private defaultModel?;
    private logger;
    private config;
    private providerRegistry;
    constructor(providerRegistry: ProviderRegistry, config: GatewayConfig, logger?: Logger);
    initializeModels(): Promise<void>;
    private createAndRegisterModel;
    register(model: IModel): void;
    get(name: string): IModel | undefined;
    has(id: string): boolean;
    list(): IModel[];
    getByProvider(providerName: string): IModel[];
    getAvailableModels(): string[];
    getModelStats(): Record<string, any>;
    private roundRobinIndex;
    getRoundRobinModel(): IModel | undefined;
    getModelsByCriteria(criteria: {
        providerType?: string;
        metadata?: Record<string, any>;
    }): IModel[];
}
//# sourceMappingURL=modelRegistry.d.ts.map