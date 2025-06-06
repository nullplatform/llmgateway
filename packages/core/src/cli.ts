#!/usr/bin/env node

// packages/core/src/cli.ts

import { program } from 'commander';
import { GatewayServer } from './gateway';
import { Logger } from './utils/logger';
import { ConfigLoader } from './config/loader.js';
import * as fs from 'fs';
import * as path from 'path';
let configLoader : ConfigLoader;
const logger = new Logger();
const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
);

program
    .name('llm-gateway')
    .description('Language Model Gateway - Agnostic proxy for LLM APIs')
    .version(packageJson.version);

program
    .command('start')
    .description('Start the LLM Gateway server')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('-c, --config <path>', 'Path to config file', './config/gateway.yaml')
    .option('--log-level <level>', 'Log level (debug, info, warn, error)', 'info')
    .action(async (options) => {
        try {
            logger.info('Starting LLM Gateway...', { options });

            // Set log level
            logger.setLevel(options.logLevel);

            // Create server instance
            const server = new GatewayServer(configLoader.getConfig());

            // Start server
            const port = parseInt(options.port, 10);
            await server.start(port);

            // Setup graceful shutdown
            const shutdown = async () => {
                logger.info('Shutting down...');
                await server.stop();
                process.exit(0);
            };

            process.on('SIGTERM', shutdown);
            process.on('SIGINT', shutdown);

        } catch (error) {
            logger.error('Failed to start server', { error });
            process.exit(1);
        }
    });

program
    .command('validate-config')
    .description('Validate configuration file')
    .option('-c, --config <path>', 'Path to config file', './config/gateway.yaml')
    .action(async (options) => {
        try {
            configLoader = new ConfigLoader(options.config);
            await configLoader.load();

            logger.info('Configuration is valid ✓');
        } catch (error) {
            logger.error('Configuration validation failed', { error });
            process.exit(1);
        }
    });

program
    .command('list-plugins')
    .description('List all available plugins')
    .option('-c, --config <path>', 'Path to config file', './config/gateway.yaml')
    .action(async (options) => {
        try {
            configLoader = new ConfigLoader(options.config);
            await configLoader.load();

            const pluginConfigs = configLoader.get('plugins', []);

            console.log('\nConfigured Plugins:');
            console.log('==================');

            for (const plugin of pluginConfigs) {
                const status = plugin.enabled ? '✓ Enabled' : '✗ Disabled';
                console.log(`${plugin.name} - ${status}`);
                console.log(`  Path: ${plugin.path}`);
                console.log(`  Priority: ${plugin.priority || 50}`);
                console.log('');
            }

        } catch (error) {
            logger.error('Failed to list plugins', { error });
            process.exit(1);
        }
    });

program
    .command('test-plugin')
    .description('Test a plugin')
    .argument('<plugin-path>', 'Path to plugin')
    .option('-c, --config <config>', 'Plugin configuration (JSON string)')
    .action(async (pluginPath, options) => {
        try {
            logger.info(`Testing plugin: ${pluginPath}`);

            // Dynamic import
            const pluginModule = await import(path.resolve(pluginPath));
            const PluginClass = pluginModule.default || pluginModule;

            // Parse config
            const config = options.config ? JSON.parse(options.config) : {};

            // Create plugin instance
            const plugin = typeof PluginClass === 'function'
                ? new PluginClass(config)
                : PluginClass;

            // Validate plugin structure
            if (!plugin.metadata) {
                throw new Error('Plugin missing metadata');
            }

            if (!plugin.execute) {
                throw new Error('Plugin missing execute method');
            }

            logger.info('Plugin loaded successfully ✓', {
                name: plugin.metadata.name,
                version: plugin.metadata.version,
                phase: plugin.phase
            });

            // Test config validation if available
            if (plugin.validateConfig) {
                const validation = plugin.validateConfig(config);
                if (validation === true) {
                    logger.info('Plugin config validation passed ✓');
                } else {
                    logger.warn('Plugin config validation failed', { validation });
                }
            }

            // Test health check if available
            if (plugin.healthCheck) {
                const healthy = await plugin.healthCheck();
                logger.info(`Plugin health check: ${healthy ? '✓ Healthy' : '✗ Unhealthy'}`);
            }

        } catch (error) {
            logger.error('Plugin test failed', { error });
            process.exit(1);
        }
    });

program
    .command('generate-config')
    .description('Generate a sample configuration file')
    .option('-o, --output <path>', 'Output file path', './gateway.yaml')
    .action(async (options) => {
        try {
            const sampleConfig = `# LLM Gateway Configuration
server:
  host: "0.0.0.0"
  port: 3000

providers:
  openai:
    api_key: "\${OPENAI_API_KEY}"
    base_url: "https://api.openai.com/v1"
    timeout: 30000
  
  anthropic:
    api_key: "\${ANTHROPIC_API_KEY}"
    base_url: "https://api.anthropic.com/v1"
    timeout: 30000

plugins:
  - name: "auth"
    path: "./plugins/auth-plugin"
    enabled: true
    priority: 100
    config:
      apiKeys:
        - "your-api-key-here"

logging:
  level: "info"
  format: "json"
`;

        await fs.writeFileSync(options.output, sampleConfig);
        logger.info(`Sample configuration generated: ${options.output}`);

    } catch (error) {
        logger.error('Failed to generate config', { error });
        process.exit(1);
    }
});

program.parse();