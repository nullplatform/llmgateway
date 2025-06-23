import axios from 'axios';
import { ClickHouseConfig, ConversationRecord, TokenConsumptionData, ConversationSummary } from '../types';
// @ts-ignore
console.log('ClickHouseService initialized with API base URL:', import.meta.env.API_BASE_URL);
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export class ClickHouseService {
  private config: ClickHouseConfig;

  constructor(config: ClickHouseConfig) {
    this.config = config;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.post(`${API_BASE_URL}/test-connection`, this.config);
      return response.data.success;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  async getTokenConsumptionByModel(tableName: string = 'conversations', startDate?: string, endDate?: string, project?: string): Promise<TokenConsumptionData[]> {
    try {
      const params: any = { table: tableName };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (project) params.project = project;
      
      const response = await axios.get(`${API_BASE_URL}/token-consumption`, { params });
      return response.data.data || [];
    } catch (error) {
      console.error('Failed to get token consumption data:', error);
      throw error;
    }
  }

  async getConversationSummaries(tableName: string = 'conversations'): Promise<ConversationSummary[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/conversations`, {
        params: { table: tableName }
      });
      return response.data.data;
    } catch (error) {
      console.error('Failed to get conversation summaries:', error);
      throw error;
    }
  }

  async getConversationDetails(interactionId: string, tableName: string = 'conversations'): Promise<ConversationRecord[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/conversation/${interactionId}`, {
        params: { table: tableName }
      });
      return response.data.data || [];
    } catch (error) {
      console.error('Failed to get conversation details:', error);
      throw error;
    }
  }

  async getProjects(tableName: string = 'conversations'): Promise<string[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/projects`, {
        params: { table: tableName }
      });
      return response.data.data?.map((row: any) => row.project) || [];
    } catch (error) {
      console.error('Failed to get projects:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await axios.post(`${API_BASE_URL}/logout`);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }
}