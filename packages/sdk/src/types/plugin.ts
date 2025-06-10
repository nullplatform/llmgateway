// packages/sdk/src/types/plugin.ts

import {IRequestContext} from './context.js';

export interface IPluginConfig {
    name: string;
    type: string; // It will be the plugin name
    enabled: boolean;
    priority?: number; // Lower numbers are executed first, default 1000
    config?: any; // Plugin-specific configuration, this object will be passed to the plugin's configure and validateConfig methods
    conditions?: {
        paths?: Array<string | RegExp>;
        methods?: Array<string | RegExp>;
        headers?: Record<string, string | RegExp>;
        user_ids?: Array<string | RegExp>;
        models?: Array<string | RegExp>;
    };
}

export interface IPluginMetadata {
    name: string;
    version: string;
    description?: string;
    configurationSchema?: any; // JSON Schema for the plugin configuration
    author?: string;
    homepage?: string;
    keywords?: string[];
}

export function PluginMetadata(metadata: IPluginMetadata) {
    return function <T extends new (...args: any[]) => IPlugin>(constructor: T) {
        (constructor as any).metadata = metadata;
        return constructor;
    };
}
export interface IPluginExecution {
    pluginName: string,
    result: IPluginResult,
    executionTime: number
}
export interface IPluginPhaseExecution {
    finalResult: IPluginResult;
    totalExecutionTime: number;
    executions: Array<IPluginExecution>;
}
export interface IPlugin {

    beforeModel?(llmRequest: IRequestContext): Promise<IPluginResult>;

    afterModel?(llmRequest: IRequestContext): Promise<IPluginResult>;

    afterChunk?(llmRequest: IRequestContext): Promise<IPluginResult>;

    detachedAfterResponse?(llmRequest: IRequestContext): Promise<void>;

    configure(config: any): Promise<void>;

    validateConfig?(config: any): Promise<boolean | string>;
}

// Plugin execution result
export interface IPluginResult {
    success: boolean;
    status?: number; // HTTP status code for the response in case of error
    context?: IRequestContext;
    error?: Error;
    reevaluateRequest?: boolean; // If it's true, the request will be re-evaluated completely, usefull for plugins that modify the request significantly. For example a plugin that can run some tools
    skipRemaining?: boolean; // Skip remaining plugins in the same phase
    terminate?: boolean; // Terminate the entire request
     /*
    If it's streaming If true, the plugin will emit a chunk to the client.
    skipRemaining true and emitChunk false will finish the plugin execution without emitting the chunk
    This is useful for plugins that buffers the response, for example in guardrails you may need to wait until a \n to analize the content
    */
    emitChunk?: boolean;

}

