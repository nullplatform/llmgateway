import { IPlugin, IRequestContext } from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import { GatewayConfig } from "../config/gatewayConfig";
export declare class PluginManager {
    private config;
    private logger;
    private plugins;
    constructor(config: GatewayConfig, logger: Logger);
    loadPlugins(): Promise<void>;
    private loadPlugin;
    private validatePlugin;
    private sortPluginsByPriority;
    execute(context: IRequestContext): Promise<IRequestContext>;
    executePostProcessing(context: IRequestContext): Promise<IRequestContext>;
    private executePhase;
    private shouldExecutePlugin;
    reloadPlugins(): Promise<void>;
    listPlugins(): Array<{
        name: string;
        phase: string;
        enabled: boolean;
        metadata: any;
    }>;
    getPlugin(name: string): IPlugin | undefined;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=manager.d.ts.map