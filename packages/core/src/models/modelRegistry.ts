// packages/core/basic-apikey-auth/models/modelRegistry.ts

import { IModel, IModelRegistry } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { ProviderRegistry } from '../providers/providerRegistry.js';
import {GatewayConfig, ModelConfig} from '../config/gatewayConfig.js';

export class ModelRegistry implements IModelRegistry {
    private models: Map<string, IModel> = new Map();
    private defaultModel?: IModel;
    private logger: Logger;
    private modelsConfig: GatewayConfig['models'];
    private providerRegistry: ProviderRegistry;

    constructor(providerRegistry: ProviderRegistry, modelsConfig:  GatewayConfig['models'], logger?: Logger) {
        this.providerRegistry = providerRegistry;
        this.logger = logger || new Logger();
        this.modelsConfig = modelsConfig;
    }

    async initializeModels(): Promise<void> {
        try {
            // Load models from configuration
            const modelsConfig = this.modelsConfig;

            if(!modelsConfig || Object.keys(modelsConfig).length === 0) {
                this.logger.warn('No models configured, skipping model initialization');
                return;
            }

            for (const [modelId, modelConfig] of Object.entries(modelsConfig)) {
                try {
                    await this.createAndRegisterModel(modelConfig as ModelConfig);
                } catch (error) {
                    this.logger.error(`Failed to initialize model '${modelId}'`, { error });
                    // Continue with other models
                }
            }
            this.logger.info(`Initialized ${this.models.size} models`);
        } catch (error) {
            this.logger.error('Failed to initialize models', { error });
            throw error;
        }
    }

    private async createAndRegisterModel(config: ModelConfig): Promise<void> {
        try {
            // Create provider instance for this model
            const provider = this.providerRegistry.createProvider(
                config.provider.type,
                config.provider.config,
                this.logger
            );

            // Create model with provider
            const model: IModel = {
                name: config.name,
                description: config.description,
                provider: provider,
                modelConfig: config.modelConfig,
                metadata: config.metadata,
                isDefault: config.isDefault
            };

            this.register(model);
        } catch (error) {
            this.logger.error(`Failed to create model '${config.name}'`, { error, config });
            throw error;
        }
    }

    register(model: IModel): void {
        if (this.models.has(model.name)) {
            this.logger.warn(`Model '${model.name}' already exists, overriding`);
        }

        this.models.set(model.name, model);
        this.logger.debug(`Model '${model.name}' registered`);
        if( model.isDefault) {
            if(this.defaultModel) {
                this.logger.warn(`Default model already set to '${this.defaultModel.name}', overriding with '${model.name}'`);
            }
            this.defaultModel = model;
            this.logger.info(`Model '${model.name}' set as default`);
        }
    }

    get(name: string): IModel | undefined {
        const model = this.models.get(name);
        if (!model) {
            if(this.defaultModel !== undefined) {
               return this.defaultModel;
            }
            this.logger.warn(`Model '${name}' not found`);
        }
        return model;
    }

    has(id: string): boolean {
        return this.models.has(id);
    }

    list(): IModel[] {
        return Array.from(this.models.values());
    }

    getByProvider(providerName: string): IModel[] {
        return this.list().filter(model => model.provider.name === providerName);
    }

    getAvailableModels(): string[] {
        return Array.from(this.models.keys());
    }

    // Get model statistics
    getModelStats(): Record<string, any> {
        const stats: Record<string, any> = {};

        for (const [id, model] of this.models) {
            stats[id] = {
                name: model.name,
                description: model.description,
                providerType: model.provider.name,
                providerConfig: {
                    baseUrl: model.provider.config.baseUrl,
                    timeout: model.provider.config.timeout,
                    retryAttempts: model.provider.config.retryAttempts
                },
                modelConfig: model.modelConfig,
                metadata: model.metadata
            };
        }

        return stats;
    }

    // Round-robin model selection
    private roundRobinIndex = 0;

    getRoundRobinModel(): IModel | undefined {
        const models = this.list();
        if (models.length === 0) return undefined;

        const model = models[this.roundRobinIndex];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % models.length;

        return model;
    }

    // Get models by criteria
    getModelsByCriteria(criteria: {
        providerType?: string;
        metadata?: Record<string, any>;
    }): IModel[] {
        return this.list().filter(model => {
            if (criteria.providerType && model.provider.name !== criteria.providerType) {
                return false;
            }

            if (criteria.metadata) {
                for (const [key, value] of Object.entries(criteria.metadata)) {
                    if (!model.metadata || model.metadata[key] !== value) {
                        return false;
                    }
                }
            }

            return true;
        });
    }

}