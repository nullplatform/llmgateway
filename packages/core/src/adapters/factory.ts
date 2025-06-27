// packages/core/basic-apikey-auth/adapters/input/modelRegistry.ts

import {ILLMApiAdapter} from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import {OpenAIApiAdapter} from "./openai";
import {AnthropicApiAdapter} from "./antropic";

export class LLMApiAdaptersFactory {
    private adaptersFactory: Map<string, new (...args: any[]) => ILLMApiAdapter> = new Map();
    private logger: Logger;

    constructor(adaptersFactory: Map<string, new (...args: any[]) => ILLMApiAdapter> = new Map(), logger?: Logger) {
        this.logger = logger || new Logger();
        this.adaptersFactory = adaptersFactory;
    }

    async initializeAdapters(): Promise<void> {
        this.registerBuiltInAdapters();

    }

    private registerBuiltInAdapters(): void {
        // Register built-in adapters
        this.adaptersFactory.set('openai',  OpenAIApiAdapter);
        this.adaptersFactory.set('anthropic', AnthropicApiAdapter);

        this.logger.debug('Built-in input adapters registered', {
            adapters: Array.from(this.adaptersFactory.keys())
        });
    }

    create(name: string, config: any): ILLMApiAdapter | undefined {
        const adapter = this.adaptersFactory.get(name);
        if (!adapter) {
            this.logger.warn(`Input adapter '${name}' not found`);
        }
        return new adapter(this.logger);
    }

}