/**
 * This loader is responsible for loading extensions (plugins, providers, adapters) from config
 */
import {ILLMApiAdapter, IPlugin, IProvider} from "@llm-gateway/sdk";
import {Logger} from "../utils/logger";
import {GatewayConfig} from "../config/gatewayConfig";
import path from "path";
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";


export class ExtensionsLoader {

    private plugins: Map<string, new (...args: any[]) => IPlugin> = new Map();
    private adapters: Map<string, new (...args: any[]) => ILLMApiAdapter> = new Map();
    private providers: Map<string, new (...args: any[]) => IProvider> = new Map();

    private logger: Logger;
    private config:  GatewayConfig['availableExtensions'];

    constructor(config: GatewayConfig['availableExtensions'], logger?: Logger) {
        this.logger = logger || new Logger();
        this.config = config;
    }

    getPluginBuilders(): Map<string, new (...args: any[]) => IPlugin> {
        return this.plugins;
    }
    getAdapterBuilders(): Map<string, new (...args: any[]) => ILLMApiAdapter> {
        return this.adapters;
    }
    getProviderBuilders(): Map<string, new (...args: any[]) => IProvider> {
        return this.providers;
    }

    async initializeExtensions(): Promise<void> {
        const availableExtensions = this.config || [];
        for (const extension of availableExtensions) {
            let module: string;
            if (extension.path) {
                module = path.resolve(extension.path);
            } else if (extension.module) {
                module = await this.resolveModule(extension.module);
            } else {
                throw new Error(`Plugin must have either path or module specified at ${JSON.stringify(extension)}`);
            }

            try {
                const extensionModule = await import(module);
                const discoveredPlugins = await this.discoverAndRegisterExtensionType<IPlugin>("plugin",extensionModule,this.implementsIPlugin.bind(this));
                for (const [name, plugin] of discoveredPlugins) {
                    this.plugins.set(name, plugin);
                }
                const discoveredProviders = await this.discoverAndRegisterExtensionType<IProvider>("llm-provider",extensionModule,this.implementsIProvider.bind(this));
                for (const [name, plugin] of discoveredProviders) {
                    this.providers.set(name, plugin);
                }
                const discoveredAdapters = await this.discoverAndRegisterExtensionType<ILLMApiAdapter>("adapter",extensionModule,this.implementsILLMAdapter.bind(this));
                for (const [name, plugin] of discoveredAdapters) {
                    this.adapters.set(name, plugin);
                }
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
                    return this.findModuleEntryPoint(globalPath, moduleName);
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
    private async discoverAndRegisterExtensionType<T>(extensionTypeName: string = "UnknownType", extensionModule: any, typeValidator: (value: unknown) => boolean): Promise<Map<string,new (...args: any[]) => T>> {
        // Get all exported values from the module
        const extensionType: Map<string, new (...args: any[]) => T> = new Map();
        const exports = Object.keys(extensionModule).map(key => ({
            name: key,
            value: extensionModule[key]
        }));

        for (const exported of exports) {
            const { name, value } = exported;

            // Check if it's a class constructor
            if (this.isConstructor(value)) {
                // Check if it's not abstract and implements IPlugin
                if (typeValidator(value) && !this.isAbstractClass(value)) {
                    try {
                        // Get plugin metadata - assuming it's a static property or method
                        const metadata = this.getExtensionMetadata(value);

                        if (metadata && metadata.name) {
                            extensionType.set(metadata.name, value);
                            this.logger.info(`Registered extension of type [${extensionTypeName}] : ${metadata.name}`);
                        } else {
                            this.logger.warn(`Plugin class ${name} doesn't have valid metadata`);
                        }
                    } catch (error) {
                        this.logger.error(`Failed to register plugin ${name}:`, error);
                    }
                }
            }
        }
        return extensionType;
    }

    private isConstructor(obj: any): boolean {
        return typeof obj === 'function' &&
            obj.prototype &&
            obj.prototype.constructor === obj;
    }


    private implementsILLMAdapter(constructor: any): boolean {
        const prototype = constructor.prototype;
        const metadata = constructor.metadata || prototype.metadata;
        return (
            prototype &&
            metadata &&
            typeof prototype === 'object' &&
            typeof prototype.configure === 'function' &&
            (
                typeof prototype.transformInput === 'function' &&
                typeof prototype.transformOutput === 'function' &&
                typeof prototype.transformOutputChunk === 'function'
            )
        );
    }

    private implementsIProvider(constructor: any): boolean {
        const prototype = constructor.prototype;
        const metadata = constructor.metadata || prototype.metadata;
        return (
            prototype &&
            metadata &&
            typeof prototype === 'object' &&
            typeof prototype.configure === 'function' &&
            (
                typeof prototype.execute === 'function' &&
                typeof prototype.executeStreaming === 'function'
            )
        );
    }

    private implementsIPlugin(constructor: any): boolean {
        const prototype = constructor.prototype;
        const metadata = constructor.metadata || prototype.metadata;
        return (
            prototype &&
            metadata &&
            typeof prototype === 'object' &&
            typeof prototype.configure === 'function' &&
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

    private getExtensionMetadata(constructor: any): { name: string; version?: string; [key: string]: any } | null {
        if (constructor.metadata) {
            return constructor.metadata;
        }

        if (constructor.prototype.metadata) {
            return constructor.prototype.metadata;
        }

        throw new Error(`Plugin class ${constructor.name} does not have metadata defined`);
    }



}