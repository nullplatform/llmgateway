
export interface IExtensionMetadata {
    name: string;
    version?: string;
    description?: string;
    configurationSchema?: any; // JSON Schema for the plugin configuration
    author?: string;
    homepage?: string;
    keywords?: string[];
}

export function ExtensionMetadata(metadata: IExtensionMetadata) {
    return function <T extends new (...args: any[]) => any>(constructor: T) {
        (constructor as any).metadata = metadata;
        return constructor;
    };
}

export interface IConfigurableExtension {
    configure(config: any): Promise<void>;

    validateConfig?(config: any): Promise<boolean | string>;
}