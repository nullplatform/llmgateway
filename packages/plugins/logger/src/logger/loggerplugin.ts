import {ILLMPlugin, ExtensionMetadata, IRequestContext, ILLMPluginResult} from '@nullplatform/llm-gateway-sdk';

export class LoggerPluginConfig {
    level: string; // e.g., 'info', 'debug', 'error'
    pepe: number
}

@ExtensionMetadata({
    name: 'logger',
    version: '1.0.0',
    description: 'A plugin for logging requests and responses'
})
export class LoggerPlugin implements ILLMPlugin {
    async configure(config: LoggerPluginConfig): Promise<void> {

}

    async beforeModel(llmRequest: IRequestContext): Promise<ILLMPluginResult> {
        // Log the request details
        console.log('Before Model:', llmRequest);

        return { success: true };
    }

    async detachedAfterResponse(llmRequest: IRequestContext): Promise<void> {
        // Log the response details
        console.log('After Response:', llmRequest.request, llmRequest.response);
    }


}