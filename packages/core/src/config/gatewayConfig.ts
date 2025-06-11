import {LLMApiAdapterRegistry} from "../adapters/registry";
import {IPluginConfig} from "@nullplatform/llm-gateway-sdk";

export interface ProviderConfig {
    type: string;
    name?: string;
    config: Record<string, any>;
}

export interface ModelConfig {
    name: string;
    isDefault?: boolean;
    description?: string;
    provider: {
        type: string;
        config: Record<string, any>;
    };
    modelConfig?: Record<string, any>;
    metadata?: Record<string, any>;
}
export interface PorjectConfig {
    name: string;
    description?: string;
    models: Record<string, ModelConfig>;
    plugins: Array<IPluginConfig>;

}
export interface GatewayConfig {
    server: {
        host: string;
        port: number;
        cors?: {
            enabled: boolean;
            origins: string[];
        };
    };
    maxRetries?: number;
    defaultProject?: boolean;
    availablePlugins: Array<{
        path?: string;
        module?: string;
    }>;
    models: Record<string, ModelConfig>;
    plugins: Array<IPluginConfig>;
    projects: Array<PorjectConfig>;
    monitoring?: {
        enabled: boolean;
        metrics?: string[];
        health_check?: {
            enabled: boolean;
            interval: number;
            endpoint: string;
        };
    };
    cache?: {
        enabled: boolean;
        provider: 'memory' | 'redis';
        connection?: string;
        ttl?: number;
    };
    logging: {
        level: 'debug' | 'info' | 'warn' | 'error';
        format: 'json' | 'simple';
        destinations?: string[];
        file_path?: string;
    };
}