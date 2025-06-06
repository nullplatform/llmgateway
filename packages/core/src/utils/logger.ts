// packages/core/src/utils/logger.ts

import * as winston from 'winston';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export class Logger {
    private winston: winston.Logger;
    private level: LogLevel = 'info';

    constructor(level: LogLevel = 'info') {
        this.level = level;
        this.winston = winston.createLogger({
            level: this.level,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'llm-gateway' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });

        // Add file transport if in production
        if (process.env.NODE_ENV === 'production') {
            this.winston.add(new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error'
            }));

            this.winston.add(new winston.transports.File({
                filename: 'logs/combined.log'
            }));
        }
    }

    setLevel(level: LogLevel): void {
        this.level = level;
        this.winston.level = level;
    }

    debug(message: string, meta?: any): void {
        this.winston.debug(message, meta);
    }

    info(message: string, meta?: any): void {
        this.winston.info(message, meta);
    }

    warn(message: string, meta?: any): void {
        this.winston.warn(message, meta);
    }

    error(message: string, meta?: any): void {
        const err = meta.error ? meta.error : meta;
        this.winston.error(message, err);
    }


    // Create child logger with additional context
    child(context: Record<string, any>): Logger {
        const childLogger = new Logger(this.level);
        childLogger.winston = this.winston.child(context);
        return childLogger;
    }

    // Performance timing helper
    time(label: string): () => number {
        const start = Date.now();
        return () => {
            const duration = Date.now() - start;
            this.debug(`Timer: ${label}`, { duration_ms: duration });
            return duration;
        };
    }

    // HTTP request logger
    logRequest(req: any, res: any, duration: number): void {
        this.info('HTTP Request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration_ms: duration,
            user_agent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            request_id: req.id
        });
    }

    // Plugin execution logger
    logPluginExecution(pluginName: string, phase: string, duration: number, success: boolean): void {
        const level = success ? 'debug' : 'warn';
        this[level]('Plugin execution', {
            plugin: pluginName,
            phase,
            duration_ms: duration,
            success
        });
    }

    // LLM provider request logger
    logProviderRequest(provider: string, model: string, tokens: any, duration: number): void {
        this.info('Provider request', {
            provider,
            model,
            input_tokens: tokens.prompt_tokens,
            output_tokens: tokens.completion_tokens,
            total_tokens: tokens.total_tokens,
            duration_ms: duration
        });
    }
}