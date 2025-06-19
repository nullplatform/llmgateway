export interface ClickHouseConfig {
  url: string;
  username?: string;
  password?: string;
  database?: string;
  project?: string;
}

export interface ConversationRecord {
  project: string;
  interaction_id: string;
  request_id: string;
  session_id?: string;
  user_id?: string;
  timestamp: string;
  start_time: string;
  end_time?: string;
  adapter?: string;
  request_model: string;
  target_model: string;
  target_model_provider: string;
  response_model?: string;
  messages: any[];
  response_content: any[];
  is_tool_callback: boolean;
  is_tool_usage: boolean;
  tool_calls?: any[];
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream: number;
  experiment_id?: string;
  experiment_variant?: string;
  client_ip?: string;
  user_agent?: string;
  headers: any;
  metadata: any;
  request_tools: any[];
  error_message?: string;
  retry_count?: number;
  finish_reason?: string;
  system_fingerprint?: string;
}

export interface TokenConsumptionData {
  response_model: string;
  total_tokens: number;
  count: number;
}

export interface ConversationSummary {
  interaction_id: string;
  project: string;
  messages_count: number;
  messages_content: string;
  response_content: string;
  total_tokens: number;
  tools_used: boolean;
  timestamp: string;
}

export interface DetailedConversation {
  interaction_id: string;
  records: ConversationRecord[];
}