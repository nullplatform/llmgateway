// packages/sdk/src/types/provider.ts

import { ILLMRequest, ILLMResponse } from './request.js';
import {IHTTPRequest, IHTTPResponse} from "./context.js";
import {OpenAIRequest} from "@nullplatform/llm-gateway-core/dist/adapters/openai";

export interface IChunkEmitter {
    onData(chunk: ILLMResponse, finalChunk: boolean): Promise<void>;
}

export interface IProvider<ConfigType = any> {
    readonly name: string;
    readonly config: ConfigType;

    execute(request: ILLMRequest): Promise<ILLMResponse>;
    executeStreaming(request: ILLMRequest, chunkEmitter: IChunkEmitter): Promise<void>;

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
    readonly type: string;
    create(config: ConfigType, logger?: any): IProvider<ConfigType>;
}

export interface INativeAdapter {
    readonly path: string;
    readonly method: 'get' | 'post' | 'put' | 'patch' | 'options' | 'delete';
    doRequest(request: IHTTPRequest, response: IHTTPResponse): Promise<void>;
}

export interface ILLMApiAdapter<TInput = any, TOutput = any> {
    readonly name: string;
    readonly basePaths: Array<string>;
    // Receives the input in native api format and returns a processed request object
    transformInput(input: TInput): Promise<ILLMRequest>;
    // Receives the processed response object and return in the original api format
    transformOutput(processedInput: ILLMRequest, input: TInput, response: ILLMResponse): Promise<TOutput>;
    transformOutputChunk(processedInput: ILLMRequest,
                          input: OpenAIRequest,
                          chunk: ILLMResponse, finalChunk: boolean, acummulated: ILLMResponse): Promise<Buffer>;
    // Native adapters to handle specific native apis for example /models
    getNativeAdapters?(): Promise<Array<INativeAdapter>>;
}

export interface IProviderRegistry {
    registerFactory(factory: IProviderFactory): void;
    getFactory(type: string): IProviderFactory | undefined;
    listFactories(): IProviderFactory[];
    createProvider(type: string, config: any, logger?: any): IProvider;
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