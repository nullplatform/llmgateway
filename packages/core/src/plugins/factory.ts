// packages/core/basic-apikey-auth/adapters/input/modelRegistry.ts

import { Logger } from '../utils/logger.js';
import {IPlugin} from "@nullplatform/llm-gateway-sdk";
import {GatewayConfig} from "../config/gatewayConfig";
import path from "path";
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import {RegexHiderPlugin} from "./bundled/retex-hider/regexHiderPlugin.js";
import {BasicApiKeyAuthPlugin} from "./bundled/basic-apikey-auth/basicApiKeyAuthPlugin.js";
import {ModelRouterPlugin} from "./bundled/model-router/modelRouterPlugin.js";

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
                module = await this.resolveModule(plugin.module);
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
    private async resolveModule(moduleName: string): Promise<string> {
        // First try to resolve as local module
        try {
            // Try to resolve locally first
            const localPath = require.resolve(moduleName);
            this.logger.info(`Resolved module ${moduleName} locally at: ${localPath}`);
            return moduleName; // Return the module name for dynamic import
        } catch (localError) {
            this.logger.warn(`Failed to resolve module ${moduleName} locally:`, localError.message);

            // If local resolution fails, try global
            try {
                const globalPath = this.getGlobalModulePath(moduleName);
                if (globalPath && existsSync(globalPath)) {
                    this.logger.info(`Resolved module ${moduleName} globally at: ${globalPath}`);

                    // Try to find the correct entry point for the global module
                    const entryPoint = this.findModuleEntryPoint(globalPath, moduleName);
                    return entryPoint;
                } else {
                    throw new Error(`Global module path not found: ${globalPath}`);
                }
            } catch (globalError) {
                this.logger.error(`Failed to resolve module ${moduleName} globally:`, globalError.message);

                // As a last resort, try the module name directly (sometimes works with global modules)
                this.logger.warn(`Attempting to import ${moduleName} directly as fallback`);
                return moduleName;
            }
        }
    }

    private getGlobalModulePath(moduleName: string): string | null {
        try {
            // Get global node_modules path
            const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
            const globalModulePath = path.join(globalRoot, moduleName);

            this.logger.debug(`Checking global module path: ${globalModulePath}`);
            return globalModulePath;
        } catch (error) {
            this.logger.error('Failed to get global npm root:', error);

            // Fallback: try common global paths
            const commonGlobalPaths = [
                '/usr/local/lib/node_modules',
                '/usr/lib/node_modules',
                path.join(process.env.HOME || '', '.npm-global/lib/node_modules'),
                path.join(process.env.APPDATA || '', 'npm/node_modules') // Windows
            ];

            for (const globalPath of commonGlobalPaths) {
                const modulePath = path.join(globalPath, moduleName);
                if (existsSync(modulePath)) {
                    this.logger.info(`Found global module at fallback path: ${modulePath}`);
                    return modulePath;
                }
            }

            return null;
        }
    }
    private findModuleEntryPoint(modulePath: string, moduleName: string): string {
        try {
            // First, try to read package.json to get the correct entry point
            const packageJsonPath = path.join(modulePath, 'package.json');
            if (existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

                this.logger.debug(`Package.json for ${moduleName}:`, {
                    main: packageJson.main,
                    module: packageJson.module,
                    exports: packageJson.exports
                });

                // Check for various entry points in order of preference
                const entryPoints = [
                    packageJson.main,
                    packageJson.module,
                    packageJson.exports?.['.']?.import,
                    packageJson.exports?.['.']?.require,
                    packageJson.exports?.['.'],
                    // Common built entry points
                    'dist/index.js',
                    'lib/index.js',
                    'build/index.js',
                    // TypeScript source files (fallback if not built)
                    'index.ts',
                    'basic-apikey-auth/index.ts',
                    // CommonJS fallbacks
                    'index.js',
                    'index.mjs'
                ];

                for (const entryPoint of entryPoints) {
                    if (entryPoint) {
                        const fullPath = path.resolve(modulePath, entryPoint);
                        this.logger.debug(`Checking entry point: ${fullPath}`);
                        if (existsSync(fullPath)) {
                            this.logger.info(`Found entry point for ${moduleName}: ${fullPath}`);
                            return fullPath;
                        }
                    }
                }

                this.logger.warn(`No valid entry point found in package.json for ${moduleName}`);
            }

            // Fallback: try common entry point files
            const commonEntryPoints = [
                'dist/index.js',  // Most likely for your package
                'index.js',
                'index.ts',       // TypeScript source if not built
                'basic-apikey-auth/index.ts',   // Source file location
                'index.mjs',
                'lib/index.js',
                'build/index.js',
                'main.js'
            ];

            this.logger.debug(`Trying fallback entry points for ${moduleName}`);
            for (const entryPoint of commonEntryPoints) {
                const fullPath = path.join(modulePath, entryPoint);
                this.logger.debug(`Checking fallback: ${fullPath}`);
                if (existsSync(fullPath)) {
                    this.logger.info(`Found fallback entry point for ${moduleName}: ${fullPath}`);
                    return fullPath;
                }
            }

            // Debug: List what's actually in the directory
            try {
                const files = readdirSync(modulePath);
                this.logger.warn(`Contents of ${modulePath}:`, files);
            } catch (e) {
                this.logger.error(`Could not read directory ${modulePath}:`, e);
            }

            // If we can't find a specific entry point, return the module path and let Node.js try to resolve it
            this.logger.warn(`Could not find entry point for ${moduleName}, using module path: ${modulePath}`);
            return modulePath;

        } catch (error) {
            this.logger.error(`Error finding entry point for ${moduleName}:`, error);
            return modulePath;
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
        this.plugins.set('model-router', ModelRouterPlugin);
        this.plugins.set('basic-apikey-auth', BasicApiKeyAuthPlugin);
        this.plugins.set('regex-hider',RegexHiderPlugin)
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