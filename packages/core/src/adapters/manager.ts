// packages/core/basic-apikey-auth/adapters/input/modelRegistry.ts

import {ILLMApiAdapter, IPlugin} from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import {OpenAIApiAdapter} from "./openai";
import {AnthropicApiAdapter} from "./antropic";
import {LLMApiAdaptersFactory} from "./factory";
import {GatewayConfig, IAdapterConfig} from "../config/gatewayConfig";

export class LLMApiAdaptersManager {
    private adaptersFactory: LLMApiAdaptersFactory;
    private logger: Logger;
    private config:  GatewayConfig['adapters'];
    private adapters: Map<string, ILLMApiAdapter> = new Map();

    constructor(adaptersFactory: LLMApiAdaptersFactory, config: GatewayConfig['adapters'], logger?: Logger) {
        this.logger = logger || new Logger();
        this.config = config;
        this.adaptersFactory = adaptersFactory;
    }

    async initializeAdapters(): Promise<void> {
        for (const [idx, adapter] of Object.entries(this.config)) {
            const adapterConfig = adapter.config || {};
            const type = adapter.type;
            try {
                const adapter = this.adaptersFactory.create(type, adapterConfig);
                if (!adapter) {
                    this.logger.warn(`Adapter '${name}' not found, skipping initialization`);
                    continue;
                }
                if(adapter.validateConfig) {
                    if(!await adapter.validateConfig(adapterConfig)) {
                        this.logger.error(`Invalid configuration for adapter '${type}': ${JSON.stringify(adapterConfig)}`);
                        continue;
                    }
                }
                await adapter.configure(adapterConfig);
                this.adapters.set(type, adapter);
                this.logger.info(`Adapter '${type}' initialized successfully`);
            } catch (error) {
                this.logger.error(`Failed to initialize adapter '${type}'`, { error });
            }
        }
    }

    getAdapters(): Map<string, ILLMApiAdapter> {
        return this.adapters;
    }


}