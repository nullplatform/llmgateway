import { ILLMApiAdapter } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
export declare class LLMApiAdapterRegistry {
    private adapters;
    private logger;
    constructor(logger?: Logger);
    initializeAdapters(): Promise<void>;
    private registerBuiltInAdapters;
    register(name: string, adapter: ILLMApiAdapter): void;
    get(name: string): ILLMApiAdapter | undefined;
    has(name: string): boolean;
    list(): Array<{
        name: string;
        adapter: ILLMApiAdapter;
    }>;
    getAvailableAdapters(): string[];
}
//# sourceMappingURL=registry.d.ts.map