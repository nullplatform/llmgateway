// packages/core/src/adapters/input/modelRegistry.ts

import { Logger } from '../utils/logger.js';
import {IPlugin} from "@nullplatform/llm-gateway-sdk";
import {GatewayConfig} from "../config/gatewayConfig";
import path from "path";

export class PluginFactory {
    private plugins: Map<string, new (...args: any[]) => IPlugin> = new Map();
    private logger: Logger;
    private config:  GatewayConfig['availablePlugins'];

    constructor(config: GatewayConfig['availablePlugins'], logger?: Logger) {
        this.logger = logger || new Logger();
        this.config = config;
    }

    async initializePlugins(): Promise<void> {
        await this.loadNativePlugins();
        const availablePlugins = this.config || [];

        for (const plugin of availablePlugins) {
            let module: string;
            if (plugin.path) {
                module = path.resolve(plugin.path);
            } else if (plugin.module) {
                module = plugin.module;
            } else {
                throw new Error(`Plugin must have either path or module specified at ${JSON.stringify(plugin)}`);
            }

            try {
                const pluginModule = await import(module);
                await this.discoverAndRegisterPlugins(pluginModule);
            } catch (error) {
                this.logger.error(`Failed to load plugin module ${module}:`, error);
                throw error;
            }
        }
    }

    private async discoverAndRegisterPlugins(pluginModule: any): Promise<void> {
        // Get all exported values from the module
        const exports = Object.keys(pluginModule).map(key => ({
            name: key,
            value: pluginModule[key]
        }));

        for (const exported of exports) {
            const { name, value } = exported;

            // Check if it's a class constructor
            if (this.isConstructor(value)) {
                // Check if it's not abstract and implements IPlugin
                if (this.implementsIPlugin(value) && !this.isAbstractClass(value)) {
                    try {
                        // Get plugin metadata - assuming it's a static property or method
                        const metadata = this.getPluginMetadata(value);

                        if (metadata && metadata.name) {
                            this.plugins.set(metadata.name, value);
                            this.logger.info(`Registered plugin: ${metadata.name}`);
                        } else {
                            this.logger.warn(`Plugin class ${name} doesn't have valid metadata`);
                        }
                    } catch (error) {
                        this.logger.error(`Failed to register plugin ${name}:`, error);
                    }
                }
            }
        }
    }

    private isConstructor(obj: any): boolean {
        return typeof obj === 'function' &&
            obj.prototype &&
            obj.prototype.constructor === obj;
    }

    private implementsIPlugin(constructor: any): boolean {
        const prototype = constructor.prototype;
        const metadata = constructor.metadata || prototype.metadata;
        return (
            prototype &&
            metadata &&
            typeof prototype === 'object' &&
            (
                typeof prototype.beforeModel === 'function' ||
                typeof prototype.afterModel === 'function' ||
                typeof prototype.configure === 'function'
            )
        );
    }

    private isAbstractClass(constructor: any): boolean {
        return constructor.prototype &&
            Object.getOwnPropertyNames(constructor.prototype)
                .some(prop => constructor.prototype[prop] === undefined);
    }

    private getPluginMetadata(constructor: any): { name: string; version?: string; [key: string]: any } | null {
        if (constructor.metadata) {
            return constructor.metadata;
        }

        if (constructor.prototype.metadata) {
            return constructor.prototype.metadata;
        }

        throw new Error(`Plugin class ${constructor.name} does not have metadata defined`);
    }

    async loadNativePlugins(): Promise<void> {
        // Load built-in plugins here
        // Example:
        // this.plugins.set('openai', OpenAIApiAdapter);
    }

    // Utility method to create plugin instances
    createPlugin(type: string): IPlugin {
        const PluginConstructor = this.plugins.get(type);
        if (PluginConstructor) {
            return new PluginConstructor();
        }
        return null;
    }

    // Get all registered plugin names
    getAvailablePlugins(): string[] {
        return Array.from(this.plugins.keys());
    }

    // Check if a plugin is registered
    hasPlugin(name: string): boolean {
        return this.plugins.has(name);
    }
}