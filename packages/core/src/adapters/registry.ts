// packages/core/src/adapters/input/modelRegistry.ts

import { ILLMApiAdapter } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import {OpenAIApiAdapter} from "./openai";
import {AnthropicApiAdapter} from "./antropic";

export class LLMApiAdapterRegistry {
    private adapters: Map<string, ILLMApiAdapter> = new Map();
    private logger: Logger;

    constructor(logger?: Logger) {
        this.logger = logger || new Logger();
    }

    async initializeAdapters(): Promise<void> {
        this.registerBuiltInAdapters();

    }

    private registerBuiltInAdapters(): void {
        // Register built-in adapters
        this.register('openai', new OpenAIApiAdapter());
        this.register('anthropic', new AnthropicApiAdapter());

        this.logger.debug('Built-in input adapters registered', {
            adapters: Array.from(this.adapters.keys())
        });
    }

    register(name: string, adapter: ILLMApiAdapter): void {
        if (this.adapters.has(name)) {
            this.logger.warn(`Input adapter '${name}' already exists, overriding`);
        }

        this.adapters.set(name, adapter);
        this.logger.debug(`Input adapter '${name}' registered`);
    }



    get(name: string): ILLMApiAdapter | undefined {
        const adapter = this.adapters.get(name);
        if (!adapter) {
            this.logger.warn(`Input adapter '${name}' not found`);
        }
        return adapter;
    }

    has(name: string): boolean {
        return this.adapters.has(name);
    }

    list(): Array<{ name: string; adapter: ILLMApiAdapter }> {
        return Array.from(this.adapters.entries()).map(([name, adapter]) => ({
            name,
            adapter
        }));
    }

    getAvailableAdapters(): string[] {
        return Array.from(this.adapters.keys());
    }


}