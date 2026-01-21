import {ILLMPlugin, ExtensionMetadata, IRequestContext, ILLMPluginResult, IMessage} from '@nullplatform/llm-gateway-sdk';

export enum PromptInjectionMode {
    OVERRIDE = 'override',
    BEFORE = 'before',
    AFTER = 'after',
    WRAPPER = 'wrapper'
}

export interface IExperimentConfig {
    prompt: string;
    percentage: number; // 0-100, percentage of requests that will use this experimental prompt
}

export class PromptManagerPluginConfig {
    prompt: string;
    mode: PromptInjectionMode = PromptInjectionMode.OVERRIDE;
    experiment?: IExperimentConfig;
}

@ExtensionMetadata({
    name: 'prompt-manager',
    version: '1.0.0',
    description: 'A plugin for managing and routing prompts with different injection modes and A/B testing support',
    configurationSchema: {
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description: 'The prompt to inject'
            },
            mode: {
                type: 'string',
                enum: ['override', 'before', 'after', 'wrapper'],
                default: 'override',
                description: 'How to inject the prompt'
            },
            experiment: {
                type: 'object',
                properties: {
                    prompt: {
                        type: 'string',
                        description: 'Alternative prompt for A/B testing'
                    },
                    percentage: {
                        type: 'number',
                        minimum: 0,
                        maximum: 100,
                        description: 'Percentage of requests that will use the experimental prompt'
                    }
                },
                required: ['prompt', 'percentage']
            }
        },
        required: ['prompt']
    }
})
export class PromptManagerPlugin implements ILLMPlugin {
    private config: PromptManagerPluginConfig;

    async configure(config: PromptManagerPluginConfig): Promise<void> {
        this.config = config;
    }

    async validateConfig(config: PromptManagerPluginConfig): Promise<boolean | string> {
        if (!config.prompt || typeof config.prompt !== 'string') {
            return 'Prompt is required and must be a string';
        }

        if (config.mode && !Object.values(PromptInjectionMode).includes(config.mode)) {
            return `Invalid injection mode. Must be one of: ${Object.values(PromptInjectionMode).join(', ')}`;
        }

        if (config.experiment) {
            if (!config.experiment.prompt || typeof config.experiment.prompt !== 'string') {
                return 'Experiment prompt is required and must be a string';
            }
            if (typeof config.experiment.percentage !== 'number' ||
                config.experiment.percentage < 0 ||
                config.experiment.percentage > 100) {
                return 'Experiment percentage must be a number between 0 and 100';
            }
        }

        if (config.mode === PromptInjectionMode.WRAPPER && !config.prompt.includes('${PROMPT}')) {
            return 'Wrapper mode requires ${PROMPT} placeholder in the prompt';
        }

        return true;
    }

    async beforeModel(llmRequest: IRequestContext): Promise<ILLMPluginResult> {
        try {
            // Determine which prompt to use (main or experiment)
            const {prompt: selectedPrompt, isExperiment} = this.selectPrompt();


            // Find existing system message
            const messages = [...llmRequest.request.messages];
            const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
            const existingSystemPrompt = systemMessageIndex >= 0 ? messages[systemMessageIndex].content : '';

            // Apply prompt injection based on mode
            const newSystemPrompt = this.injectPrompt(selectedPrompt, existingSystemPrompt);

            // Update or create system message
            if (systemMessageIndex >= 0) {
                messages[systemMessageIndex] = {
                    ...messages[systemMessageIndex],
                    content: newSystemPrompt
                };
            } else {
                messages.unshift({
                    role: 'system',
                    content: newSystemPrompt
                });
            }

            // Store prompt information in metadata
            const promptMetadata = {
                original_system_prompt: existingSystemPrompt,
                used_system_prompt: selectedPrompt,
                full_system_prompt: newSystemPrompt,
                injection_mode: this.config.mode,
                is_experiment: isExperiment,
                ...(isExperiment && { experiment_percentage: this.config.experiment?.percentage })
            };

            // Update request context
            const updatedContext: IRequestContext = {
                ...llmRequest,
                request: {
                    ...llmRequest.request,
                    messages
                }

            };

            if(!updatedContext.metadata?.prompt_manager) {
                updatedContext.metadata.prompt_manager = promptMetadata
            } else {
                //TODO: merge metadata if needed
            }

            return {
                success: true,
                context: updatedContext
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error : new Error('Unknown error in prompt manager plugin')
            };
        }
    }

    private selectPrompt(): {prompt: string, isExperiment: boolean} {
        // If no experiment configured, use main prompt
        if (!this.config.experiment) {
            return {prompt: this.config.prompt, isExperiment: false};
        }

        // Generate random number between 0-100 to determine if we should use experiment
        const randomValue = Math.random() * 100;

        return randomValue < this.config.experiment.percentage
            ? {prompt: this.config.experiment.prompt, isExperiment: true}
            : {prompt: this.config.prompt, isExperiment: false};
    }

    private injectPrompt(promptToInject: string, existingPrompt: string): string {
        switch (this.config.mode) {
            case PromptInjectionMode.OVERRIDE:
                return promptToInject;

            case PromptInjectionMode.BEFORE:
                if (!existingPrompt) {
                    return promptToInject;
                }
                return `${promptToInject}\n\n${existingPrompt}`;

            case PromptInjectionMode.AFTER:
                if (!existingPrompt) {
                    return promptToInject;
                }
                return `${existingPrompt}\n\n${promptToInject}`;

            case PromptInjectionMode.WRAPPER:
                if (!existingPrompt) {
                    // If no existing prompt, replace placeholder with empty string
                    return promptToInject.replace('${PROMPT}', '');
                }
                return promptToInject.replace('${PROMPT}', existingPrompt);

            default:
                return promptToInject;
        }
    }
}