// packages/core/src/plugins/manager.ts

import * as path from 'path';

import {
    IPlugin,
    IPluginConfig,
    IPluginResult,
    IRequestContext,
    IPluginPhaseExecution,
    IPluginExecution
} from '@nullplatform/llm-gateway-sdk';
import { Logger } from '../utils/logger.js';
import {GatewayConfig} from "../config/gatewayConfig";
import {PluginFactory} from "./factory";


export class PluginManager {
    private plugins: Array<{name: string, plugin: IPlugin, config: IPluginConfig}> = [];
    private config: GatewayConfig;
    private pluginFactory: PluginFactory;
    private logger: Logger;

    constructor(
        config: GatewayConfig,
        pluginFactory: PluginFactory,
        logger: Logger
    ) {
        this.config = config;
        this.pluginFactory = pluginFactory;
        this.logger = logger;
    }

    async loadPlugins(): Promise<void> {
        let pluginConfigs = this.config.plugins || [];

        pluginConfigs.sort((a,b) => a.priority - b.priority)

        this.logger.info(`Loading ${pluginConfigs.length} plugins`);

        for (const pluginConfig of pluginConfigs) {
            if (!pluginConfig.enabled) {
                this.logger.debug(`Skipping disabled plugin: ${pluginConfig.name}`);
                continue;
            }

            try {
                await this.loadPlugin(pluginConfig);
            } catch (error) {
                this.logger.error(`Failed to load plugin ${pluginConfig.name}`, { error });
                throw error;
            }
        }

        this.logger.info(`Successfully loaded ${this.plugins.length} plugins`);
    }

    private async loadPlugin(config: IPluginConfig): Promise<void> {
        if(!config.priority) {
            config.priority = 1000;
        }
        const plugin = this.pluginFactory.createPlugin(config.type)
        if(plugin.validateConfig) {
            await plugin.validateConfig(config.config);
        }
        await plugin.configure(config.config);
        this.plugins.push({name: config.name, plugin, config});
    }

    async executePluginFunction(llmRequest: IRequestContext, pluginFunction: string, reverseOrder: boolean = false, isDettachedRun: boolean = false ): Promise<void | IPluginPhaseExecution> {
        let request = llmRequest;
        let lastExecution: IPluginResult;
        let startTime = Date.now();
        const executions: Array<IPluginExecution> = [];
        for (const {plugin, config} of (reverseOrder ? this.plugins.slice().reverse() : this.plugins)) {
            if (typeof plugin[pluginFunction] === 'function') {
                let executionStart = Date.now();
                const shouldExecute = await this.shouldExecutePlugin(config, llmRequest);
                if( !shouldExecute ) {
                    this.logger.debug(`Skipping plugin ${config.name} for request ${llmRequest.request_id} due to conditions`);
                    continue;
                }
                try {

                    const result: IPluginResult = await plugin[pluginFunction](request);
                    if(isDettachedRun) {
                        // If this is a detached run, we don't need to process the result further
                        continue;
                    }
                    //Update context because plugin can return a modified context or null
                    result.context = {
                        ...llmRequest,
                        ...(result?.context ? result.context : {}),
                    }
                    result.context.metadata = {
                        ...llmRequest.metadata,
                        ...(result?.context?.metadata ? result.context.metadata : {}),
                    }

                    request = result.context;
                    lastExecution = result;
                    executions.push({pluginName: config.name, result: lastExecution, executionTime: Date.now() - executionStart});
                    if (result && (result.terminate || result.skipRemaining)) {
                        break;
                    }
                } catch (error) {
                    this.logger.error(`Error executing plugin function ${pluginFunction} for plugin ${JSON.stringify(config)}`, { error });
                    lastExecution = {
                        success: false,
                        context: llmRequest,
                        error: error as Error,
                    };
                    executions.push({pluginName: config.name, result: lastExecution, executionTime: Date.now() - executionStart});
                    break;
                }
            }
        }
        const totalExecutionTime = Date.now() - startTime;
        this.logger.debug(`Executed ${pluginFunction} for ${executions.length} plugins in ${totalExecutionTime}ms`);
        if( isDettachedRun ) {
            return;
        }
        return {
            finalResult: lastExecution || { success: true, context: llmRequest },
            totalExecutionTime,
            executions
        };
    }

    async beforeModel(llmRequest: IRequestContext): Promise<IPluginPhaseExecution> {
        return await this.executePluginFunction(llmRequest, 'beforeModel') as IPluginPhaseExecution;
    }

    async afterModel(llmRequest: IRequestContext): Promise<IPluginPhaseExecution> {
        return await this.executePluginFunction(llmRequest, 'afterModel', true) as IPluginPhaseExecution;
    }

    async afterChunk(llmRequest: IRequestContext) : Promise<IPluginPhaseExecution> {
        return await this.executePluginFunction(llmRequest, 'afterChunk', true) as IPluginPhaseExecution;
    }

    async detachedAfterResponse(llmRequest: IRequestContext) : Promise<void> {
        return await this.executePluginFunction(llmRequest, 'detachedAfterResponse', true, true) as void;
    }

    private async matchStringOrRegExp(value: string, pattern: string | RegExp): Promise<boolean> {
        if (typeof pattern === 'string') {
            return value.startsWith(pattern);
        } else if (pattern instanceof RegExp) {
            return pattern.test(value);
        }
        return false;
    }

    private async shouldExecutePlugin(config: IPluginConfig, llmRequest: IRequestContext): Promise<boolean> {
        const conditions = config.conditions;
        if (!conditions) return true;

        // Check paths
        if (conditions.paths && conditions.paths.length > 0) {
            if (!llmRequest.httpRequest.url || !conditions.paths.some(async p => await this.matchStringOrRegExp(llmRequest.httpRequest.url, p))) {
                return false;
            }
        }

        // Check methods
        if (conditions.methods && conditions.methods.length > 0) {
            if (!llmRequest.httpRequest.method || !conditions.methods.some(async m => await this.matchStringOrRegExp(llmRequest.httpRequest.method, m))) {
                return false;
            }
        }

        // Check headers
        if (conditions.headers) {
            for (const [key, value] of Object.entries(conditions.headers)) {
                const headerVal = llmRequest.httpRequest.headers?.[key];
                if (!headerVal || !(await this.matchStringOrRegExp(headerVal, value))) {
                    return false;
                }
            }
        }

        // Check user_ids
        if (conditions.user_ids && conditions.user_ids.length > 0) {
            if (!llmRequest.user_id || !conditions.user_ids.some(async uid => await this.matchStringOrRegExp(llmRequest.user_id, uid))) {
                return false;
            }
        }

        // Check models
        if (conditions.models && conditions.models.length > 0) {
            if (!llmRequest.target_model || !conditions.models.some(async model => await this.matchStringOrRegExp(llmRequest.target_model, model))) {
                return false;
            }
        }

        return true;
    }

}