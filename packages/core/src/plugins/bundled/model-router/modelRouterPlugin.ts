import {ILLMPlugin, ExtensionMetadata, IRequestContext, ILLMPluginResult} from '@nullplatform/llm-gateway-sdk';

export class ModelRoutingPluginConfig {
    model: string; //simply select
    fallbacks: Array<string>; //If primary model fails continue with them, if no model is selected fallbacks will be used as list of models
}

@ExtensionMetadata({
    name: 'model-router',
    version: '1.0.0',
    description: 'A plugin for routing between models'
})
export class ModelRouterPlugin implements ILLMPlugin {
    private config: ModelRoutingPluginConfig;
    private fullFallbacks: Array<string> = [];
    async configure(config: ModelRoutingPluginConfig): Promise<void> {
        this.fullFallbacks = [] ;
        if(config.model) {
            this.fullFallbacks.push(config.model);
        }
        if(config.fallbacks && Array.isArray(config.fallbacks)) {
            this.fullFallbacks.push(...config.fallbacks);
        }
        this.config = config;
    }



    async beforeModel(llmRequest: IRequestContext): Promise<ILLMPluginResult> {
        const tryModel = llmRequest.retry_count || 0;
        if (tryModel >= this.fullFallbacks.length) {
            return {
                success: false,
                terminate: true,
                error: new Error('No more models to try')
            };
        }
        const model = this.fullFallbacks[tryModel];
        if(llmRequest.available_models.indexOf(this.fullFallbacks[tryModel]) === -1) {
            return {
                success: false,
                terminate: true,
                error: new Error(`Model [${model}] not found`)
            };
        }
        return { success: true, context: {...llmRequest, target_model: this.fullFallbacks[tryModel]} };
    }

    async onModelError(llmRequest: IRequestContext): Promise<ILLMPluginResult> {
        return {
            success: true,
            reevaluateRequest: true,
        }
    }
}