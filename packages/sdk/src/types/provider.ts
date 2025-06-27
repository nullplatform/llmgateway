// packages/sdk/basic-apikey-auth/types/provider.ts

import { ILLMRequest, ILLMResponse } from './request.js';
import {IHTTPRequest, IHTTPResponse} from "./context.js";
import {IPluginPhaseExecution} from "./plugin.js";
import {IConfigurableExtension} from "./extension";

export interface IChunkEmitter {
    onData(chunk: ILLMResponse, finalChunk: boolean): Promise<IPluginPhaseExecution | undefined>;
}

export class LLMModelError extends Error {
    constructor(error: Error) {
        super(error.message);
        this.name = 'LLMModelError';

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LLMModelError);
        }
    }
}

export interface IProvider<ConfigType = any> extends IConfigurableExtension{
    readonly name: string;

    execute(request: ILLMRequest): Promise<ILLMResponse>;
    executeStreaming(request: ILLMRequest, chunkEmitter: IChunkEmitter): Promise<IPluginPhaseExecution | void>;

}

export interface IModel {
    readonly name: string;
    readonly description?: string;
    readonly provider: IProvider;
    readonly modelConfig?: any;
    readonly metadata?: Record<string, any>;
    readonly isDefault?: boolean;
}

export interface IProviderFactory<ConfigType = any> {
    readonly name: string;
    readonly type?: string;
    create(config: ConfigType, logger?: any): IProvider<ConfigType>;
}

export interface INativeAdapter {
    readonly path: string;
    readonly method: 'get' | 'post' | 'put' | 'patch' | 'options' | 'delete';
    doRequest(request: IHTTPRequest, response: IHTTPResponse): Promise<void>;
}

export interface ILLMApiAdapter<TInput = any, TOutput = any> extends IConfigurableExtension{
    readonly name: string;
    readonly basePaths: Array<string>;
    // Receives the input in native api format and returns a processed request object
    transformInput(input: TInput): Promise<ILLMRequest>;
    // Receives the processed response object and return in the original api format
    transformOutput(processedInput: ILLMRequest, input: TInput, response: ILLMResponse): Promise<TOutput>;
    transformOutputChunk(processedInput: ILLMRequest,
                          input: TInput,
                          chunk: ILLMResponse, firstChunk: boolean, finalChunk: boolean, acummulated: ILLMResponse): Promise<Buffer>;
    // Native adapters to handle specific native apis for example /models
    getNativeAdapters?(): Promise<Array<INativeAdapter>>;
}


export interface IModelRegistry {
    register(model: IModel): void;
    get(name: string): IModel | undefined;
    list(): IModel[];
    getByProvider(providerName: string): IModel[];
    getAvailableModels(): string[];
}

export interface IAdapterRegistry<T> {
    register(name: string, adapter: T): void;
    unregister(name: string): void;
    get(name: string): T | undefined;
    list(): Array<{ name: string; adapter: T }>;
}