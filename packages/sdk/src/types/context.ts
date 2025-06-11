// packages/sdk/src/types/context.ts

import { ILLMRequest, ILLMResponse } from './request.js';

export interface IRequestMetrics {
    start_time: Date;
    end_time?: Date;
    duration_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
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
    project?: string; // Project identifier, if applicable
    request: ILLMRequest;
    response?: ILLMResponse; //If streaming, this will be undefined
    adapter?: string;
    chunk?: ILLMResponse; // For streaming responses, this will be the current chunk, It can't be modified, gateway will use bufferedChunk to send to the client
    bufferedChunk?: ILLMResponse; // For streaming this is the accoumulated merged chunk that has not been sent yet if all chunks are emitted or is first chunk will be same that chunk

    accumulated_response?: ILLMResponse; // For streaming, this is the whole answer merged chunk at the end this should be like a response without streaming
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
    target_model_provider?: string;
    available_models?: string[];
    // Custom data for plugins
    metadata: Record<string, any>;
}
