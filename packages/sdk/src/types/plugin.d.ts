import { IRequestContext } from './context.js';
import { ILLMResponse } from "@acme/sdk";
export interface IPluginConfig {
    name: string;
    type: string;
    enabled: boolean;
    config?: any;
    conditions?: {
        paths?: string[];
        methods?: string[];
        headers?: Record<string, string | RegExp>;
        user_ids?: string[];
        models?: string[];
    };
}
export interface IPluginMetadata {
    name: string;
    version: string;
    description?: string;
    author?: string;
    homepage?: string;
    keywords?: string[];
}
export declare function PluginMetadata(metadata: IPluginMetadata): <T extends new (...args: any[]) => IPlugin>(constructor: T) => T;
export interface IPlugin {
    readonly metadata: IPluginMetadata;
    beforeExecute?(llmRequest: IRequestContext): Promise<IPluginResult>;
    afterExecute?(llmRequest: IRequestContext, llmResponse: ILLMResponse): Promise<IPluginResult>;
    configure?(config: any): void;
    validateConfig?(config: any): boolean | string;
}
export interface IPluginResult {
    success: boolean;
    context: IRequestContext;
    error?: Error;
    skip_remaining?: boolean;
    terminate?: boolean;
}
//# sourceMappingURL=plugin.d.ts.map