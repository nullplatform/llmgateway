import {IPlugin, PluginMetadata,IPluginMetadata, IRequestContext, IPluginResult} from '@nullplatform/llm-gateway-sdk';

export class LoggerPluginConfig {
    level: string; // e.g., 'info', 'debug', 'error'
    pepe: number
}

@PluginMetadata({
    name: 'logger',
    version: '1.0.0',
    description: 'A plugin for logging requests and responses'
})
export class LoggerPlugin implements IPlugin {
    async configure(config: LoggerPluginConfig): Promise<void> {

    }

    async beforeModel(llmRequest: IRequestContext): Promise<IPluginResult> {
        // Log the request details
        console.log('Before Model:', llmRequest);

        return { success: true };
    }

    async detachedAfterResponse(llmRequest: IRequestContext): Promise<void> {
        // Log the response details
        console.log('After Response:', llmRequest.request, llmRequest.response);
    }


}