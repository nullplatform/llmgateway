import { Logger } from '../../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('debug');
  });

  describe('initialization', () => {
    it('should create logger with default level', () => {
      const defaultLogger = new Logger();
      expect(defaultLogger).toBeDefined();
    });

    it('should create logger with specified level', () => {
      const infoLogger = new Logger('info');
      expect(infoLogger).toBeDefined();
    });
  });

  describe('logging methods', () => {
    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });
  });

  describe('method execution', () => {
    it('should not throw when calling info', () => {
      expect(() => {
        logger.info('Test message', { key: 'value' });
      }).not.toThrow();
    });

    it('should not throw when calling error', () => {
      expect(() => {
        logger.error('Test error', { error: new Error('test') });
      }).not.toThrow();
    });

    it('should not throw when calling debug', () => {
      expect(() => {
        logger.debug('Test debug');
      }).not.toThrow();
    });

    it('should not throw when calling warn', () => {
      expect(() => {
        logger.warn('Test warning');
      }).not.toThrow();
    });
  });

  describe('metadata handling', () => {
    it('should handle complex metadata objects', () => {
      const complexMetadata = {
        request_id: '123',
        user: { id: 1, name: 'test' },
        timing: { start: new Date(), duration: 100 },
        nested: { deep: { value: 'test' } }
      };

      expect(() => {
        logger.info('Complex log', complexMetadata);
      }).not.toThrow();
    });

    it('should handle circular references in metadata', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      expect(() => {
        logger.info('Circular reference test', { circular });
      }).not.toThrow();
    });
  });
});