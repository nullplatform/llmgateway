import { GatewayConfig } from "./gatewayConfig";
export declare class ConfigLoader {
    private config;
    private configPath;
    private schema;
    constructor(configPath?: string);
    load(): Promise<GatewayConfig>;
    get<T = any>(path: string, defaultValue?: T): T;
    getConfig(): GatewayConfig;
    private replaceEnvVars;
    private getNestedProperty;
    private createValidationSchema;
    watch(callback: (config: GatewayConfig) => void): Promise<void>;
    export(outputPath: string, format?: 'yaml' | 'json'): Promise<void>;
}
//# sourceMappingURL=loader.d.ts.map