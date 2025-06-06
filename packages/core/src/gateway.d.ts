import { GatewayConfig } from "./config/gatewayConfig";
export declare class GatewayServer {
    private app;
    private pipelineManager;
    private configLoader;
    private logger;
    private config;
    private llmApiAdapters;
    private providerRegistry;
    private modelRegistry;
    constructor(config: string | GatewayConfig);
    private setupMiddleware;
    private setupRoutes;
    private setupLLMRoutes;
    private setupPluginRoutes;
    private handleLLMRequest;
    private setupErrorHandling;
    initialize(): Promise<void>;
    start(port?: number): Promise<void>;
    stop(): Promise<void>;
}
declare global {
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}
//# sourceMappingURL=gateway.d.ts.map