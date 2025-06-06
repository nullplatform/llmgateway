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
export interface IRequestContext {
    request: ILLMRequest;
    response?: ILLMResponse;
    request_id: string;
    user_id?: string;
    session_id?: string;
    plugin_data: Map<string, any>;
    metrics: IRequestMetrics;
    error?: Error;
    retry_count?: number;
    experiment_id?: string;
    experiment_variant?: string;
    headers: Record<string, string>;
    query_params: Record<string, string>;
    client_ip?: string;
    user_agent?: string;
    target_model?: string;
    available_models?: string[];
    custom: Record<string, any>;
}
//# sourceMappingURL=context.d.ts.map