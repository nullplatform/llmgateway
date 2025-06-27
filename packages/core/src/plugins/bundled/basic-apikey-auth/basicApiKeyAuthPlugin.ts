import {IPlugin, ExtensionMetadata,IExtensionMetadata, IRequestContext, IPluginResult} from '@nullplatform/llm-gateway-sdk';

export class BasicApiKeyAuthPluginConfig {
    apikeys: string[]; // List of valid API keys
}

@ExtensionMetadata({
    name: 'basic-apikey-auth',
    version: '1.0.0',
    description: 'A plugin for logging requests and responses',
    configurationSchema: {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "title": "ClickHouse Conversation Plugin Configuration",
        "description": "Configuration schema for the TracerPlugin that stores conversation data in ClickHouse",
        "required": ["clickhouse"],
        "properties": {
            "apikeys": {
                "type": "array",
                "description": "List of valid API keys for authentication",
                "items": {
                    "type": "string"
                },
                "minItems": 1 // Ensure at least one API key is provided
            }
        },
        "additionalProperties": false
    }
})
export class BasicApiKeyAuthPlugin implements IPlugin {
    private config: BasicApiKeyAuthPluginConfig;
    async configure(config: BasicApiKeyAuthPluginConfig): Promise<void> {
        this.config = config;
    }

    async validateConfig?(config: any): Promise<boolean | string> {
        if (!Array.isArray(config.apikeys) || config.apikeys.length === 0) {
            return 'Invalid configuration: apikeys must be a non-empty array';
        }
        return true;
    }



    async beforeModel(llmRequest: IRequestContext): Promise<IPluginResult> {
        let apiKey = llmRequest.httpRequest.headers['authorization'] || llmRequest.httpRequest.headers['x-api-key'] || '';
        apiKey = apiKey.replace(/^Bearer\s+/i, '');
        if(this.config.apikeys.indexOf(apiKey) === -1) {
            return {
                success: false,
                terminate: true,
                status: 401,
                error: new Error('Unauthorized: Invalid API key')
            };
        }
        return { success: true };
    }
}