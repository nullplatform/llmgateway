export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export declare class Logger {
    private winston;
    private level;
    constructor(level?: LogLevel);
    setLevel(level: LogLevel): void;
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
    child(context: Record<string, any>): Logger;
    time(label: string): () => number;
    logRequest(req: any, res: any, duration: number): void;
    logPluginExecution(pluginName: string, phase: string, duration: number, success: boolean): void;
    logProviderRequest(provider: string, model: string, tokens: any, duration: number): void;
}
//# sourceMappingURL=logger.d.ts.map