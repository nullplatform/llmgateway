// packages/core/src/config/loader.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';
import * as Joi from 'joi';
import {GatewayConfig} from "./gatewayConfig";



export class ConfigLoader {
    private config: GatewayConfig | null = null;
    private configPath: string;
    private schema: Joi.ObjectSchema;

    constructor(configPath: string = './config/gateway.yaml') {
        this.configPath = configPath;
        this.schema = this.createValidationSchema();
    }

    async load(): Promise<GatewayConfig> {
        try {
            // Check if config file exists
            await fs.access(this.configPath);

            // Read config file
            const configContent = await fs.readFile(this.configPath, 'utf-8');

            // Parse based on file extension
            let rawConfig: any;
            const ext = path.extname(this.configPath).toLowerCase();

            if (ext === '.yaml' || ext === '.yml') {
                rawConfig = YAML.parse(configContent);
            } else if (ext === '.json') {
                rawConfig = JSON.parse(configContent);
            } else {
                throw new Error(`Unsupported config file format: ${ext}`);
            }

            // Replace environment variables
            rawConfig = this.replaceEnvVars(rawConfig);

            // Validate config
            const { error, value } = this.schema.validate(rawConfig, {
                allowUnknown: true,
                stripUnknown: false
            });

            if (error) {
                throw new Error(`Configuration validation failed: ${error.message}`);
            }

            this.config = value;
            return this.config;

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Configuration file not found: ${this.configPath}`);
            }
            throw error;
        }
    }

    get<T = any>(path: string, defaultValue?: T): T {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call load() first.');
        }

        return this.getNestedProperty(this.config, path) ?? defaultValue;
    }

    getConfig(): GatewayConfig {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call load() first.');
        }
        return this.config;
    }

    private replaceEnvVars(obj: any): any {
        if (typeof obj === 'string') {
            // Replace ${ENV_VAR} or $ENV_VAR patterns
            return obj.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, unbraced) => {
                const envVar = braced || unbraced;
                return process.env[envVar] || match;
            });
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.replaceEnvVars(item));
        }

        if (obj && typeof obj === 'object') {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.replaceEnvVars(value);
            }
            return result;
        }

        return obj;
    }

    private getNestedProperty(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    private createValidationSchema(): Joi.ObjectSchema {
        const modelsSchema = Joi.array().items(Joi.object({
            name: Joi.string().required(),
            isDefault: Joi.boolean().default(false),
            description: Joi.string().optional(),
            provider: Joi.object({
                type: Joi.string().required(),
                config: Joi.object().required()
            }).required(),
            modelConfig: Joi.object().optional(),
            metadata: Joi.object().optional()
        })).default([]);
        const pluginsSchema = Joi.array().items(
            Joi.object({
                name: Joi.string().required(),
                type: Joi.string().required(),
                enabled: Joi.boolean().default(true),
                priority: Joi.number().integer().min(0).max(1000).default(1000),
                config: Joi.object().optional(),
                conditions: Joi.object({
                    paths: Joi.array().items(Joi.string()).optional(),
                    methods: Joi.array().items(Joi.string().valid('GET', 'POST', 'PUT', 'DELETE', 'PATCH')).optional(),
                    headers: Joi.object().optional(),
                    user_ids: Joi.array().items(Joi.string()).optional(),
                    models: Joi.array().items(Joi.string()).optional()
                }).optional()
            })
        ).default([]);
        return Joi.object({
            server: Joi.object({
                host: Joi.string().default('0.0.0.0'),
                port: Joi.number().integer().min(1).max(65535).default(3000),
                cors: Joi.object({
                    enabled: Joi.boolean().default(true),
                    origins: Joi.array().items(Joi.string()).default(['*'])
                }).optional()
            }).required(),
            projects: Joi.array().items(
                Joi.object({
                    name: Joi.string().required(),
                    description: Joi.string().optional(),
                    models: modelsSchema,
                    plugins: pluginsSchema
                })
            ).default([]),
            availablePlugins: Joi.array().items(
                Joi.object({
                    path: Joi.string().optional(),
                    module: Joi.string().optional()
                })),
            defaultProject: Joi.boolean().default(true),


            models: modelsSchema,

            plugins: pluginsSchema,

            routing: Joi.object({
                strategy: Joi.string().valid('round_robin', 'least_latency', 'weighted').default('round_robin'),
                model_mapping: Joi.object().pattern(
                    Joi.string(),
                    Joi.object({
                        models: Joi.array().items(Joi.string()).required()
                    })
                ).optional(),
                fallbacks: Joi.object().pattern(
                    Joi.string(),
                    Joi.array().items(Joi.string())
                ).optional(),
                weights: Joi.object().pattern(
                    Joi.string(),
                    Joi.number().min(0).max(100)
                ).optional()
            }).optional(),

            monitoring: Joi.object({
                enabled: Joi.boolean().default(true),
                metrics: Joi.array().items(Joi.string()).optional(),
                health_check: Joi.object({
                    enabled: Joi.boolean().default(true),
                    interval: Joi.number().integer().min(5).default(30),
                    endpoint: Joi.string().default('/health')
                }).optional()
            }).optional(),

            cache: Joi.object({
                enabled: Joi.boolean().default(false),
                provider: Joi.string().valid('memory', 'redis').default('memory'),
                connection: Joi.string().optional(),
                ttl: Joi.number().integer().min(60).default(3600)
            }).optional(),

            logging: Joi.object({
                level: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
                format: Joi.string().valid('json', 'simple').default('json'),
                destinations: Joi.array().items(Joi.string().valid('console', 'file')).default(['console']),
                file_path: Joi.string().default('./logs/gateway.log')
            }).default({
                level: 'info',
                format: 'json',
                destinations: ['console']
            })
        });
    }

    // Watch for config file changes (useful for development)
    async watch(callback: (config: GatewayConfig) => void): Promise<void> {
        const { watch } = await import('chokidar');

        const watcher = watch(this.configPath, {
            ignoreInitial: true,
            persistent: true
        });

        watcher.on('change', async () => {
            try {
                const newConfig = await this.load();
                callback(newConfig);
            } catch (error) {
                console.error('Failed to reload configuration:', error);
            }
        });
    }

    // Export current config to file
    async export(outputPath: string, format: 'yaml' | 'json' = 'yaml'): Promise<void> {
        if (!this.config) {
            throw new Error('No configuration loaded');
        }

        let content: string;
        if (format === 'yaml') {
            content = YAML.stringify(this.config);
        } else {
            content = JSON.stringify(this.config, null, 2);
        }

        await fs.writeFile(outputPath, content, 'utf-8');
    }
}