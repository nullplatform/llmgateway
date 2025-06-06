import { Logger } from '../utils/logger.js';
import { IPlugin } from "@nullplatform/llm-gateway-sdk";
import { GatewayConfig } from "../config/gatewayConfig";
export declare class PluginFactory {
    private plugins;
    private logger;
    private config;
    constructor(config: GatewayConfig, logger?: Logger);
    initializePlugins(): Promise<void>;
    private discoverAndRegisterPlugins;
    private isConstructor;
    private implementsIPlugin;
    private isAbstractClass;
    private getPluginMetadata;
    loadNativePlugins(): Promise<void>;
    createPlugin(name: string): IPlugin | null;
    getAvailablePlugins(): string[];
    hasPlugin(name: string): boolean;
}
//# sourceMappingURL=factory.d.ts.map