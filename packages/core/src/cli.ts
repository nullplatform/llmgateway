#!/usr/bin/env node

import { program } from 'commander';
import * as dotenv from 'dotenv';
import { GatewayServer } from './gateway.js';
import { Logger } from './utils/logger.js';

dotenv.config();

const logger = new Logger();

program
    .name('llm-gateway')
    .description('LLM Gateway - Proxy server for Large Language Models')
    .version('1.0.0');

program
    .command('start')
    .description('Start the LLM Gateway server')
    .option('-c, --config <path>', 'Path to configuration file')
    .action(async (options) => {
        if (!options.config) {
            logger.error('Configuration file path is required. Use -c or --config to specify the path.');
            process.exit(1);
        }
        try {
            logger.info('Starting LLM Gateway...', { configPath: options.config });

            const server = new GatewayServer(options.config);

            await server.start();

            // Setup graceful shutdown
            const shutdown = async (signal: string) => {
                logger.info(`Received ${signal}, shutting down gracefully...`);
                await server.stop();
                process.exit(0);
            };

            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));

            process.on('unhandledRejection', (reason, promise) => {
                logger.error('Unhandled Rejection:', { promise, reason });
            });

            process.on('uncaughtException', (error) => {
                logger.error('Uncaught Exception:', { error });
                process.exit(1);
            });

        } catch (error) {
            logger.error('Failed to start LLM Gateway', { error });
            process.exit(1);
        }
    });

program
    .command('config')
    .description('Generate example configuration file')
    .option('-o, --output <path>', 'Output path for configuration file', './gateway.config.yaml')
    .action((options) => {
        const fs = require('fs');
        const path = require('path');
        
        const exampleConfig = `# LLM Gateway Configuration
server:
  cors:
    origins:
      - "*"

maxRetries: 3
defaultProject: true

models:
 - name: gpt
    isDefault: true
    provider:
      type: "openai"
      config:
        apiKey: "\$\{OPENAI_API_KEY\}"
    
 
`;

        try {
            fs.writeFileSync(options.output, exampleConfig, 'utf8');
            console.log(`Configuration file created at: ${path.resolve(options.output)}`);
        } catch (error) {
            console.error('Failed to create configuration file:', error.message);
            process.exit(1);
        }
    });

program.parse();