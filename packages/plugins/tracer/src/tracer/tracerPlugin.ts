import {
    IPlugin,
    PluginMetadata,
    IPluginMetadata,
    IRequestContext,
    IPluginResult, IContent, ILLMRequest, ILLMResponse, IMessage
} from '@nullplatform/llm-gateway-sdk';
import {ClickHouseClient, createClient} from '@clickhouse/client';
import {ConfigSchema} from "./configSchema";

export interface ClickHouseConfig {
    url: string;
    username?: string;
    password?: string;
    access_token?: string;
    database?: string;
    debug?: boolean;
}

export class ClickHouseConversationPluginConfig {
    clickhouse: ClickHouseConfig;
    tableName: string; // ClickHouse table name (default: 'conversations')
    batchSize: number; // Number of records to batch insert (default: 100)
    flushInterval: number; // Interval to flush pending records in ms (default: 10 seconds)
}

interface ConversationRecord {
    interaction_id: string;
    request_id: string;
    session_id?: string;
    user_id?: string;
    timestamp?: string;
    start_time: string;
    end_time?: string;
    adapter?: string;
    request_model: string;
    target_model: string;
    target_model_provider: string;
    messages: any;
    response_content: any;
    is_tool_callback?: boolean;
    is_tool_usage?: boolean;
    tool_calls?: any;
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
    error_message?: string;
    retry_count?: number;
    finish_reason?: string;
    system_fingerprint?: string;
}

@PluginMetadata({
    name: 'tracer',
    version: '1.0.0',
    description: 'Stores conversation data in ClickHouse with tool sequence buffering and detailed metrics',
    configurationSchema: ConfigSchema
})
export class TracerPlugin implements IPlugin {
    private config!: ClickHouseConversationPluginConfig;
    private clickhouse!: ClickHouseClient;
    private pendingRecords: ConversationRecord[] = [];
    private flushTimer?: NodeJS.Timeout;

    async configure(config: ClickHouseConversationPluginConfig): Promise<void> {
        this.config = {
            clickhouse: config.clickhouse,
            tableName: config.tableName || 'conversations',
            batchSize: config.batchSize || 100,
            flushInterval: config.flushInterval || 10 * 1000 // 10 seconds
        };

        // Initialize ClickHouse client
        this.clickhouse = createClient({
            url: this.config.clickhouse.url,
            username: this.config.clickhouse.username,
            password: this.config.clickhouse.password,
            access_token: this.config.clickhouse.access_token,
            database: this.config.clickhouse.database || 'default'
        });

        // Create table if it doesn't exist
        await this.ensureTableExists();

        // Start flush timer
        this.startFlushTimer();
    }

    async validateConfig(config: ClickHouseConversationPluginConfig): Promise<boolean | string> {
        if (!config.clickhouse?.url) {
            return 'ClickHouse url is required';
        }

        if (config.batchSize && config.batchSize < 1) {
            return 'batchSize must be at least 1';
        }

        try {
            // Test ClickHouse connection
            const testClient = createClient({
                url: config.clickhouse.url,
                username: config.clickhouse.username,
                password: config.clickhouse.password,
                access_token: config.clickhouse.access_token,
                database: config.clickhouse.database || 'default'
            });

            await testClient.query({
                query: 'SELECT 1'
            });
            return true;
        } catch (error) {
            return `Failed to connect to ClickHouse: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }

    private async ensureTableExists(): Promise<void> {
        const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
            interaction_id String,
            request_id String,
            session_id Nullable(String),
            user_id Nullable(String),
            timestamp DateTime64,
            start_time Nullable(DateTime64),
            end_time Nullable(DateTime64),
            adapter Nullable(String),
            request_model Nullable(String),
            target_model Nullable(String),
            target_model_provider Nullable(String),
            messages Array(JSON) DEFAULT [],
            response_content Array(JSON) DEFAULT [],
            is_tool_callback Boolean,
            is_tool_usage Boolean,
            tool_calls Array(JSON) DEFAULT [],
            duration_ms Nullable(UInt32),
            input_tokens Nullable(UInt32),
            output_tokens Nullable(UInt32),
            total_tokens Nullable(UInt32),
            temperature Nullable(Float32),
            max_tokens Nullable(UInt32),
            top_p Nullable(Float32),
            frequency_penalty Nullable(Float32),
            presence_penalty Nullable(Float32),
            stream UInt8,
            experiment_id Nullable(String),
            experiment_variant Nullable(String),
            client_ip Nullable(String),
            user_agent Nullable(String),
            headers Nullable(JSON),
            metadata Nullable(JSON),
            error_message Nullable(String),
            retry_count Nullable(UInt8),
            finish_reason Nullable(String),
            system_fingerprint Nullable(String),
            date Date MATERIALIZED toDate(timestamp)
        ) ENGINE = MergeTree()
        PARTITION BY date
        ORDER BY (interaction_id, timestamp)
        SETTINGS index_granularity = 8192
    `;

        try {
            await this.clickhouse.query({ query: createTableQuery });
        } catch (error) {
            console.error('Failed to create ClickHouse table:', error);
            throw error;
        }
    }


    private startFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(async () => {
            await this.flushPendingRecords();
        }, this.config.flushInterval);
    }

    private async flushPendingRecords(): Promise<void> {
        if (this.pendingRecords.length === 0) {
            return;
        }

        const recordsToFlush = this.pendingRecords.splice(0, this.config.batchSize);

        try {
            await this.clickhouse.insert({
                table: this.config.tableName,
                values: recordsToFlush,
                format: 'JSONEachRow'
            });
        } catch (error) {
            console.error('Failed to flush records to ClickHouse:', error);
            // Re-add records to the beginning of the pending queue for retry
            this.pendingRecords.unshift(...recordsToFlush);
        }
    }

    private requestWasTollCallback(request: ILLMRequest): boolean {
        return request?.messages?.length > 2 && request?.messages[request.messages.length - 2]?.tool_calls?.length > 0;
    }

    private lookForFirstToolId(content: Partial<IMessage>[]): string | undefined {
        for (const item of content) {
            if (item?.tool_calls?.length) {
                return item.tool_calls[0].id;
            }
        }
        return undefined;
    }

    private calculateRequestFingerprint(request: ILLMRequest): string | undefined {
        return this.lookForFirstToolId(request.messages);
    }

    private calculateResponseFingerprint(response: ILLMResponse): string | undefined {
        return this.lookForFirstToolId(response.content.map((e) => e.message));
    }

    private extractToolCallIds(messages: IMessage[]): string[] {
        const toolCallIds: string[] = [];
        for (const message of messages) {
            if (message.tool_calls) {
                toolCallIds.push(...message.tool_calls.map(tc => tc.id));
            }
            if (message.tool_call_id) {
                toolCallIds.push(message.tool_call_id);
            }
        }
        return toolCallIds;
    }

    private getFinishReason(response?: ILLMResponse): string | undefined {
        if (!response?.content) return undefined;

        const lastContent = response.content[response.content.length - 1];
        return lastContent?.finish_reason || undefined;
    }

    async detachedAfterResponse(context: IRequestContext): Promise<void> {
        // Check if request was a tool callback
        const requestWasToolCallback = this.requestWasTollCallback(context.request);

        // Check if the response is a tool response
        const responseIsToolUsage = context.response?.content?.some(content =>
            content.message?.role === 'tool' || content.message?.tool_calls?.length > 0
        );

        /*
         Because when tools are used, many messages are exchanged we'll try to create an interaction id using the first tool id.
         It's transient the request id but only for an answer that have tools as next step
         */
        let interactionId: string | undefined = context.session_id;

        if (requestWasToolCallback) {
            interactionId = this.calculateRequestFingerprint(context.request);
        }

        if (responseIsToolUsage) {
            interactionId = interactionId || this.calculateResponseFingerprint(context.response);
        }

        if (!interactionId) {
            interactionId = context.session_id || context.request_id || 'unknown_session';
        }

        await this.saveConversationData(context, interactionId);
    }

    private async saveConversationData(context: IRequestContext, interactionId: string): Promise<void> {
        try {
            const now = new Date();

            // Extract tool information
            const allMessages = [...context.request.messages];
            if (context.response?.content) {
                const responseMessages = context.response.content
                    .map(c => c.message)
                    .filter(m => m) as IMessage[];
                allMessages.push(...responseMessages);
            }

            const toolCallIds = this.extractToolCallIds(allMessages);
            const toolCalls = allMessages
                .filter(m => m.tool_calls)
                .flatMap(m => m.tool_calls || []);

            const record: ConversationRecord = {
                interaction_id: interactionId,
                request_id: context.request_id,
                session_id: context.session_id,
                user_id: context.user_id,
                timestamp: now.toISOString().replace('T', ' ').replace('Z', ''),
                start_time: new Date(context.metrics.start_time).toISOString().replace('T', ' ').replace('Z', ''),
                end_time: new Date(context.metrics.end_time || now).toISOString().replace('T', ' ').replace('Z', ''),
                adapter: context.adapter || 'unknown',
                request_model: context.request.model,
                target_model: context.target_model,
                target_model_provider: context.target_model_provider,
                messages: context.request.messages,
                response_content: context.response?.content,
                is_tool_callback: this.requestWasTollCallback(context.request) ? true : false,
                is_tool_usage: context.response?.content?.some(content =>
                    content.message?.role === 'tool' || content.message?.tool_call_id
                ) ? true : false,
                tool_calls: toolCalls,
                duration_ms: context.metrics.duration_ms,
                input_tokens: context.metrics.input_tokens,
                output_tokens: context.metrics.output_tokens,
                total_tokens: context.metrics.total_tokens,
                temperature: context.request.temperature,
                max_tokens: context.request.max_tokens,
                top_p: context.request.top_p,
                frequency_penalty: context.request.frequency_penalty,
                presence_penalty: context.request.presence_penalty,
                stream: context.request.stream ? 1 : 0,
                experiment_id: context.experiment_id,
                experiment_variant: context.experiment_variant,
                client_ip: context.client_ip,
                user_agent: context.user_agent,
                headers: context.headers,
                metadata: context.metadata,
                error_message: context.error?.message,
                retry_count: context.retry_count,
                finish_reason: this.getFinishReason(context.response),
                system_fingerprint: context.response?.system_fingerprint
            };

            // Add to pending records for batch insertion
            this.pendingRecords.push(record);

            // If we've reached the batch size, flush immediately
            if (this.pendingRecords.length >= this.config.batchSize) {
                await this.flushPendingRecords();
            }
        } catch (error) {
            console.error('Error saving conversation data:', error);
            // Don't throw the error to avoid breaking the main request flow
        }
    }

    // Cleanup method to ensure all pending records are flushed
    async destroy(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Flush any remaining records
        await this.flushPendingRecords();
    }
}