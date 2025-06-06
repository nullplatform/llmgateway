import { ILLMRequest, ILLMResponse } from './request.js';
export interface IProvider<ConfigType = any> {
    readonly name: string;
    readonly config: ConfigType;
    execute(request: ILLMRequest): Promise<ILLMResponse>;
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
export interface ILLMApiAdapter<TInput = any, TOutput = any> {
    readonly name: string;
    readonly basePaths: Array<string>;
    transformInput(input: TInput): Promise<ILLMRequest>;
    transformOutput(processedInput: ILLMRequest, input: TInput, response: ILLMResponse): Promise<TOutput>;
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