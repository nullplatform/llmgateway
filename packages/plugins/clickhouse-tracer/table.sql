-- ClickHouse table for storing conversation data with tool sequences and metrics
CREATE TABLE IF NOT EXISTS conversations (
    -- Primary identifiers
                                             interaction_id String,
                                             request_id String,
                                             session_id Nullable(String),
    user_id Nullable(String),

    -- Timestamps
    timestamp DateTime64(3),
    start_time DateTime64(3),
    end_time Nullable(DateTime64(3)),

    -- Request/Response data
    model String,
    target_provider String,
    messages JSON, -- JSON array of messages
    response_content String, -- JSON array of response content

-- Tool information
    is_tool_callback UInt8,
    is_tool_usage UInt8,
    tool_calls String, -- JSON array of tool calls
    tool_call_ids Array(String),

    -- Metrics
    duration_ms Nullable(UInt32),
    input_tokens Nullable(UInt32),
    output_tokens Nullable(UInt32),
    total_tokens Nullable(UInt32),

    -- Request parameters
    temperature Nullable(Float32),
    max_tokens Nullable(UInt32),
    top_p Nullable(Float32),
    frequency_penalty Nullable(Float32),
    presence_penalty Nullable(Float32),
    stream UInt8,

    -- Metadata
    experiment_id Nullable(String),
    experiment_variant Nullable(String),
    client_ip Nullable(String),
    user_agent Nullable(String),
    headers Nullable(JSON), -- JSON object
    metadata Nullable(JSON), -- JSON object

-- Error information
    error_message Nullable(String),
    retry_count Nullable(UInt8),

    -- Response details
    finish_reason Nullable(String),
    system_fingerprint Nullable(String),

    -- Indexing timestamp for partitioning
    date Date MATERIALIZED toDate(timestamp)
    ) ENGINE = MergeTree()
    PARTITION BY date
    ORDER BY (interaction_id, timestamp)
    SETTINGS index_granularity = 8192;