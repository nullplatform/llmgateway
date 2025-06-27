// packages/core/basic-apikey-auth/providers/providerRegistry.ts

import {IProvider} from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger';
import {OpenAIProvider} from './openai';
import {AnthropicProvider} from "./anthropic";

export class ProviderRegistry {
    private factories: Map<string,  new (...args: any[]) => IProvider> = new Map();
    private logger: Logger;

    constructor(factories: Map<string,  new (...args: any[]) => IProvider> = new Map(), logger?: Logger) {
        this.logger = logger || new Logger();
        this.factories = factories;
        this.registerBuiltInFactories();
    }

    private registerBuiltInFactories(): void {
        // Register built-in provider factories
        this.factories.set("openai", OpenAIProvider);
        this.factories.set("anthropic", AnthropicProvider);

        this.logger.debug('Built-in provider factories registered', {
            factories: Array.from(this.factories.keys())
        });
    }


    async createProvider(type: string, config: any, logger?: Logger): Promise<IProvider<any>> {
        const factory = this.factories.get(type);
        if (!factory) {
            throw new Error(`Provider factory for type '${type}' not found`);
        }

        try {
            const provider = new factory(logger);
            if(provider.validateConfig) {
                if(!await provider.validateConfig(config)) {
                    throw new Error(`Invalid configuration for provider type '${type}' ${JSON.stringify(config)}`);
                }
            }
            await provider.configure(config);
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