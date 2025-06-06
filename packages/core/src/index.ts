// packages/core/src/index.ts

import * as dotenv from 'dotenv';
import { GatewayServer } from './gateway.js';
import { Logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

const logger = new Logger();

async function main() {
    try {
        logger.info('Starting LLM Gateway...');

        const server = new GatewayServer("../../config/gateway.example.yaml");
        const port = parseInt(process.env.PORT || '3000', 10);

        await server.start(port);

        // Graceful shutdown handling
        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM, shutting down gracefully...');
            await server.stop();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            logger.info('Received SIGINT, shutting down gracefully...');
            await server.stop();
            process.exit(0);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', { promise, reason });
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', { error });
            process.exit(1);
        });

    } catch (error) {
        logger.error('Failed to start LLM Gateway', { error });
        process.exit(1);
    }
}

// Export for programmatic usage
export { GatewayServer } from './gateway.js';
export { PluginManager } from './plugins/manager.js';
export * from './providers/openai.js';

// Start server if this file is run directly
if (require.main === module) {
    main();
}