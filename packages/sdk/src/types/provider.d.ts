import { ILLMRequest, ILLMResponse } from './request.js';
import { IHTTPRequest, IHTTPResponse } from "./context.js";
import { IPluginPhaseExecution } from "@llm-gateway/sdk";
export interface IChunkEmitter {
    onData(chunk: ILLMResponse, finalChunk: boolean): Promise<IPluginPhaseExecution | undefined>;
}
export declare class LLMModelError extends Error {
    constructor(error: Error);
}
export interface IProvider<ConfigType = any> {
    readonly name: string;
    readonly config: ConfigType;
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
    transformInput(input: TInput): Promise<ILLMRequest>;
    transformOutput(processedInput: ILLMRequest, input: TInput, response: ILLMResponse): Promise<TOutput>;
    transformOutputChunk(processedInput: ILLMRequest, input: TInput, chunk: ILLMResponse, firstChunk: boolean, finalChunk: boolean, acummulated: ILLMResponse): Promise<Buffer>;
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
    list(): Array<{
        name: string;
        adapter: T;
    }>;
}
//# sourceMappingURL=provider.d.ts.map