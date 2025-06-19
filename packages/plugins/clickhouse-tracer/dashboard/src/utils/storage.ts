import { ClickHouseConfig } from '../types';

const SESSION_KEY = 'clickhouse_session';

export const sessionStorage = {
  save: (config: ClickHouseConfig): void => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  },

  load: (): ClickHouseConfig | null => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  },

  clear: (): void => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }
};