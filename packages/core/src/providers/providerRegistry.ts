// packages/core/src/providers/providerRegistry.ts

import { IProvider, IProviderFactory, IProviderRegistry } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import { OpenAIProviderFactory } from './openai.js';
import {AnthropicProviderFactory} from "./anthropic";
import {GatewayConfig} from "../config/gatewayConfig";

export class ProviderRegistry implements IProviderRegistry {
    private factories: Map<string, IProviderFactory> = new Map();
    private logger: Logger;

    constructor(config: GatewayConfig, logger?: Logger) {
        this.logger = logger || new Logger();
        this.registerBuiltInFactories();
    }

    private registerBuiltInFactories(): void {
        // Register built-in provider factories
        this.registerFactory(new OpenAIProviderFactory());
        this.registerFactory(new AnthropicProviderFactory());

        this.logger.debug('Built-in provider factories registered', {
            factories: Array.from(this.factories.keys())
        });
    }

    registerFactory(factory: IProviderFactory): void {
        if (this.factories.has(factory.type)) {
            this.logger.warn(`Provider factory '${factory.type}' already exists, overriding`);
        }

        this.factories.set(factory.type, factory);
        this.logger.debug(`Provider factory '${factory.type}' registered`);
    }

    getFactory(type: string): IProviderFactory | undefined {
        const factory = this.factories.get(type);
        if (!factory) {
            this.logger.warn(`Provider factory '${type}' not found`);
        }
        return factory;
    }

    listFactories(): IProviderFactory[] {
        return Array.from(this.factories.values());
    }

    createProvider(type: string, config: any, logger?: Logger): IProvider {
        const factory = this.getFactory(type);
        if (!factory) {
            throw new Error(`Provider factory for type '${type}' not found`);
        }

        try {
            const provider = factory.create(config, logger || this.logger);
            this.logger.debug(`Provider of type '${type}' created successfully`);
            return provider;
        } catch (error) {
            this.logger.error(`Failed to create provider of type '${type}'`, { error, config });
            throw new Error(`Failed to create provider of type '${type}': ${error.message}`);
        }
    }

    getAvailableProviderTypes(): string[] {
        return Array.from(this.factories.keys());
    }

}