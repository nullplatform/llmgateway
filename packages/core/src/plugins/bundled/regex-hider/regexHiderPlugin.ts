import {ILLMPlugin, ExtensionMetadata, IRequestContext, ILLMPluginResult} from '@nullplatform/llm-gateway-sdk';

export interface RegexPatternConfig {
    pattern: string; // The regex pattern
    applyTo: 'request' | 'response' | 'both'; // Where to apply this pattern
    replacement?: string; // Replacement string for this pattern (overrides global default)
    blockOnMatch?: boolean; // If true, block when this pattern matches (overrides global default)
    caseSensitive?: boolean; // Whether this pattern should be case sensitive (overrides global default)
}

export class RegexHiderPluginConfig {
    replacement: string; // Default replacement string for matched patterns
    bufferConfig: {
        maxSize: number; // Maximum size of the buffer to hold request/response data
        timeout: number; // Timeout for processing the buffer (in ms)
        flushOn: 'newline' | 'maxSize' | 'timeout' | 'all'; // When to flush the buffer
    };
    patterns: Array<RegexPatternConfig>; // Regex patterns with their application scope
    blockOnMatch: boolean; // Default: If true, block the request/response entirely instead of masking
    caseSensitive: boolean; // Default: Whether regex matching should be case sensitive
    logMatches: boolean; // Whether to log when matches are found
}

interface CompiledPattern {
    regex: RegExp;
    replacement: string;
    blockOnMatch: boolean;
}

interface BufferState {
    content: string;
    timer?: NodeJS.Timeout;
    context: IRequestContext;
}

@ExtensionMetadata({
    name: 'regex-hider',
    version: '1.0.0',
    description: 'A plugin to search regex patterns and hide them, useful for sensitive data masking',
})
export class RegexHiderPlugin implements ILLMPlugin {
    private config!: RegexHiderPluginConfig;
    private requestPatterns: CompiledPattern[] = [];
    private responsePatterns: CompiledPattern[] = [];
    private bufferMap = new Map<string, BufferState>();

    async configure(config: RegexHiderPluginConfig): Promise<void> {
        this.config = {
            replacement: config.replacement || '[REDACTED]',
            bufferConfig: {
                maxSize: config.bufferConfig?.maxSize || 1024,
                timeout: config.bufferConfig?.timeout || 5000,
                flushOn: config.bufferConfig?.flushOn || 'newline'
            },
            patterns: config.patterns || [],
            blockOnMatch: config.blockOnMatch || false,
            caseSensitive: config.caseSensitive || false,
            logMatches: config.logMatches || true
        };

        // Compile patterns and separate by application scope
        this.requestPatterns = this.compilePatterns(this.config.patterns, ['request', 'both']);
        this.responsePatterns = this.compilePatterns(this.config.patterns, ['response', 'both']);
    }

    private compilePatterns(patterns: RegexPatternConfig[], targetScope: string[]): CompiledPattern[] {
        return patterns
            .map(patternConfig => {
                if(!patternConfig.applyTo) {
                    patternConfig.applyTo = 'both';
                }
                if(!targetScope.includes(patternConfig.applyTo)) {
                    return undefined;
                }
                const replacement = patternConfig.replacement ?? this.config.replacement;
                const blockOnMatch = patternConfig.blockOnMatch ?? this.config.blockOnMatch;
                const caseSensitive = patternConfig.caseSensitive ?? this.config.caseSensitive;

                const flags = caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(patternConfig.pattern, flags);

                return {
                    regex,
                    replacement,
                    blockOnMatch
                };
            }).filter((e) => e !== undefined);
    }

    async validateConfig(config: RegexHiderPluginConfig): Promise<boolean | string> {
        try {
            // Validate regex patterns
            if (config.patterns) {
                for (const patternConfig of config.patterns) {
                    // Validate regex pattern
                    new RegExp(patternConfig.pattern);

                    // Validate applyTo field
                    if (!['request', 'response', 'both'].includes(patternConfig.applyTo)) {
                        return `Invalid applyTo value: ${patternConfig.applyTo}. Must be 'request', 'response', or 'both'`;
                    }
                }
            }

            // Validate buffer config
            if (config.bufferConfig) {
                if (config.bufferConfig.maxSize <= 0) {
                    return 'bufferConfig.maxSize must be greater than 0';
                }
                if (config.bufferConfig.timeout <= 0) {
                    return 'bufferConfig.timeout must be greater than 0';
                }
            }

            return true;
        } catch (error) {
            return `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }

    async beforeModel(context: IRequestContext): Promise<ILLMPluginResult> {
        if (this.requestPatterns.length === 0) {
            return { success: true };
        }

        try {
            // Check all messages in the request
            let shouldBlock = false;
            const processedMessages = context.request.messages.map(message => {
                const { content: processedContent, shouldBlock: messageBlocked } = this.processText(message.content, this.requestPatterns);
                if (messageBlocked) {
                    shouldBlock = true;
                    if (this.config.logMatches) {
                        console.warn(`[RegexHiderPlugin] Sensitive data detected in request message (role: ${message.role})`);
                    }
                }
                return { ...message, content: processedContent };
            });

            if (shouldBlock) {
                return {
                    success: false,
                    status: 400,
                    error: new Error('Request blocked due to sensitive data detection'),
                    terminate: true
                };
            } else {
                // Update the context with masked content
                context.request.messages = processedMessages;
            }

            return { success: true };
        } catch (error) {
            console.error('[TracerPlugin] Error in beforeModel:', error);
            return {
                success: false,
                error: error instanceof Error ? error : new Error('Unknown error in TracerPlugin')
            };
        }
    }
    async afterChunk(context: IRequestContext): Promise<ILLMPluginResult> {
        try {
            const chunkContent = this.extractChunkContent(context.bufferedChunk!);
            // Determine if we should flush
            const shouldFlush = this.shouldFlush(chunkContent, context.finalChunk);

            if (shouldFlush) {
                let shouldBlock = false;
                const processedContent = context.bufferedChunk.content.map(content => {
                    const messageKey = content.message ? "message" : "delta";
                    if (content[messageKey]?.content) {
                        const { content: processedText, shouldBlock: contentBlocked } = this.processText(chunkContent, this.responsePatterns);
                        if (contentBlocked) {
                            shouldBlock = true;
                            if (this.config.logMatches) {
                                console.warn('[TracerPlugin] Sensitive data detected in response');
                            }
                        }
                        return {
                            ...content,
                            [messageKey]: { ...content[messageKey], ...content[messageKey], content: processedText }
                        };
                    }
                    return content;
                });
                if (shouldBlock) {
                    return {
                        success: false,
                        status: 400,
                        error: new Error('Request blocked due to sensitive data detection'),
                        terminate: true
                    };
                }

                context.bufferedChunk.content = processedContent;
                return {
                    success: true,
                    emitChunk: true,
                    context
                }
            } else {

                return {
                    success: true,
                    emitChunk: false
                };
            }
        } catch (error) {
            console.error('[TracerPlugin] Error in handleStreamingChunk:', error);
            return {
                success: false,
                error: error instanceof Error ? error : new Error('Unknown error in streaming chunk handler')
            };
        }
    }
    async afterModel(context: IRequestContext): Promise<ILLMPluginResult> {
        if (this.responsePatterns.length === 0 || !context.request.stream) {
            // For non-streaming responses, process immediately
            return this.processNonStreamingResponse(context);
        }


        return { success: true };
    }

    private async processNonStreamingResponse(context: IRequestContext): Promise<ILLMPluginResult> {
        if (!context.response || this.responsePatterns.length === 0) {
            return { success: true };
        }

        try {
            let shouldBlock = false;
            const processedContent = context.response.content.map(content => {
                if (content.message?.content) {
                    const { content: processedText, shouldBlock: contentBlocked } = this.processText(content.message.content, this.responsePatterns);
                    if (contentBlocked) {
                        shouldBlock = true;
                        if (this.config.logMatches) {
                            console.warn('[TracerPlugin] Sensitive data detected in response');
                        }
                    }
                    return {
                        ...content,
                        message: { ...content.message, content: processedText }
                    };
                }
                return content;
            });

            if (shouldBlock) {
                return {
                    success: false,
                    status: 400,
                    error: new Error('Response blocked due to sensitive data detection'),
                    terminate: true
                };
            } else {
                context.response.content = processedContent;
            }

            return { success: true };
        } catch (error) {
            console.error('[TracerPlugin] Error in processNonStreamingResponse:', error);
            return {
                success: false,
                error: error instanceof Error ? error : new Error('Unknown error in TracerPlugin')
            };
        }
    }


    private shouldFlush(content: string, isFinalChunk: boolean): boolean {
        if(isFinalChunk) {
            return true;
        }
        const { flushOn, maxSize } = this.config.bufferConfig;

        switch (flushOn) {
            case 'newline':
                return content.includes('\n');
            case 'maxSize':
                return content.length >= maxSize;
            case 'timeout':
                return false; // Only flush on timeout
            case 'all':
                return content.includes('\n') || content.length >= maxSize;
            default:
                return false;
        }
    }


    private processText(text: string, patterns: CompiledPattern[]): { content: string, shouldBlock: boolean } {
        let processedText = text;
        let shouldBlock = false;

        for (const compiledPattern of patterns) {
            const { regex, replacement, blockOnMatch } = compiledPattern;

            // Reset the regex lastIndex to ensure consistent behavior
            regex.lastIndex = 0;
            if (regex.test(processedText)) {
                if (blockOnMatch) {
                    shouldBlock = true;
                    // If any pattern requires blocking, we can return early
                    return { content: processedText, shouldBlock: true };
                } else {
                    // Reset again for replacement
                    regex.lastIndex = 0;
                    processedText = processedText.replace(regex, replacement);
                }
            }
        }

        return { content: processedText, shouldBlock };
    }

    private extractChunkContent(chunk: any): string {
        // Extract content from various possible chunk formats
        if (chunk.content && Array.isArray(chunk.content)) {
            return chunk.content
                .map((c: any) => c.delta?.content || c.message?.content || '')
                .join('');
        }

        if (chunk.delta?.content) {
            return chunk.delta.content;
        }

        if (chunk.message?.content) {
            return chunk.message.content;
        }

        return '';
    }

    private updateChunkContent(chunk: any, newContent: string): void {
        // Update chunk content based on its structure
        if (chunk.content && Array.isArray(chunk.content)) {
            // Assuming single content item for simplicity
            if (chunk.content[0]) {
                if (chunk.content[0].delta) {
                    chunk.content[0].delta.content = newContent;
                } else if (chunk.content[0].message) {
                    chunk.content[0].message.content = newContent;
                }
            }
        } else if (chunk.delta) {
            chunk.delta.content = newContent;
        } else if (chunk.message) {
            chunk.message.content = newContent;
        }
    }

    async detachedAfterResponse(context: IRequestContext): Promise<void> {
        // Clean up any remaining buffers for this request
        this.bufferMap.delete(context.request_id);
    }
}