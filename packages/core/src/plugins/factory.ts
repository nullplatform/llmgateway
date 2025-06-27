// packages/core/basic-apikey-auth/adapters/input/modelRegistry.ts

import { Logger } from '../utils/logger.js';
import {IPlugin} from "@nullplatform/llm-gateway-sdk";
import {GatewayConfig} from "../config/gatewayConfig";

import {RegexHiderPlugin} from "./bundled/regex-hider/regexHiderPlugin.js";
import {BasicApiKeyAuthPlugin} from "./bundled/basic-apikey-auth/basicApiKeyAuthPlugin.js";
import {ModelRouterPlugin} from "./bundled/model-router/modelRouterPlugin.js";
import {PromptManagerPlugin} from "./bundled/promt-manager/promtManagerPlugin";

export class PluginFactory {
    private plugins: Map<string, new (...args: any[]) => IPlugin> = new Map();
    private logger: Logger;
    private config:  GatewayConfig['availableExtensions'];

    constructor(plugins: Map<string, new (...args: any[]) => IPlugin> = new Map(), logger?: Logger) {
        this.logger = logger || new Logger();
        this.plugins = plugins;
    }

    async initializePlugins(): Promise<void> {
        await this.loadNativePlugins();
    }
    async loadNativePlugins(): Promise<void> {
        // Load built-in plugins here
        // Example:
        // this.plugins.set('openai', OpenAIApiAdapter);
        this.plugins.set('model-router', ModelRouterPlugin);
        this.plugins.set('basic-apikey-auth', BasicApiKeyAuthPlugin);
        this.plugins.set('regex-hider',RegexHiderPlugin)
        this.plugins.set('prompt-manager',PromptManagerPlugin);

    }

    // Utility method to create plugin instances
    createPlugin(type: string): IPlugin {
        const PluginConstructor = this.plugins.get(type);
        if (PluginConstructor) {
            return new PluginConstructor();
        }
        return null;
    }

}