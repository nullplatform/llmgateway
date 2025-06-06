// packages/sdk/src/types/context.ts

import { ILLMRequest, ILLMResponse } from './request.js';

export interface IRequestMetrics {
    start_time: number;
    end_time?: number;
    duration_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
}

export interface IHTTPRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
}

export interface IHTTPResponse {
    //Answer a json
    status(status: number): void;
    json(data: any): void;
}

export interface IRequestContext {
    // Core request/response data
    request: ILLMRequest;
    response?: ILLMResponse; //If streaming, this will be undefined

    chunk?: ILLMResponse; // For streaming responses, this will be the current chunk
    accumulated_response?: ILLMResponse; // For streaming, this will accumulate chunks
    finalChunk?: boolean; // Indicates if the current chunk is the final one

    httpRequest?: IHTTPRequest;
    // Request identification and routing
    request_id: string;
    user_id?: string;
    session_id?: string;

    // Plugin execution state
    plugin_data: Map<string, any>;

    // Metrics and monitoring
    metrics: IRequestMetrics;

    // Error handling
    error?: Error;
    retry_count?: number;

    // Experiment and testing
    experiment_id?: string;
    experiment_variant?: string;

    // Request metadata
    headers: Record<string, string>;
    query_params: Record<string, string>;
    client_ip?: string;
    user_agent?: string;

    // Available models to route
    target_model?: string;
    available_models?: string[];
    // Custom data for plugins
    metadata: Record<string, any>;
}
