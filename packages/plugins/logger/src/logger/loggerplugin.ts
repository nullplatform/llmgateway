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
        console.log('Configuring Logger Plugin with config');
        console.log(config.pepe);

    }

    async beforeModel(llmRequest: IRequestContext): Promise<IPluginResult> {
        // Log the request details
        console.log('Before Model:', llmRequest);

        return { success: true };
    }

    async afterModel(llmRequest: IRequestContext): Promise<IPluginResult> {
        console.log('After Model:', llmRequest);
        return { success: true };
    }
}