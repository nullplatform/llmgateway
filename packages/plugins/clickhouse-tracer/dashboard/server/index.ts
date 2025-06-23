import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient, ClickHouseClient } from '@clickhouse/client';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

interface ClickHouseConfig {
  url: string;
  username?: string;
  password?: string;
  database?: string;
  project?: string;
}

interface ActiveConnection {
  client: ClickHouseClient;
  config: ClickHouseConfig;
}

let activeConnection: ActiveConnection | null = null;

// Test connection endpoint
app.post('/api/test-connection', async (req: Request, res: Response) => {
  try {
    const config: ClickHouseConfig = req.body;
    
    const client = createClient({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database || 'default'
    });

    await client.query({ query: 'SELECT 1' });
    
    // Store the connection for subsequent requests
    activeConnection = { client, config };
    
    res.json({ success: true });
  } catch (error) {
    console.error('Connection test failed:', error);
    res.status(400).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});
app.get('/api/health', async (req: Request, res: Response) => {
  res.json({ status: 'ok' });
})

// Get token consumption by model
app.get('/api/token-consumption', async (req: Request, res: Response) => {
  try {
    if (!activeConnection) {
      return res.status(401).json({ error: 'No active connection' });
    }

    const { client, config } = activeConnection;
    const tableName = req.query.table || 'conversations';
    
    // Project filtering - use either configured project or query parameter
    const queryProject = req.query.project as string;
    const projectToFilter = config.project || queryProject;
    const projectFilter = projectToFilter ? `AND project = '${projectToFilter}'` : '';
    
    // Date filtering
    let dateFilter = '';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    if (startDate && endDate) {
      dateFilter = `AND timestamp BETWEEN '${startDate}' AND '${endDate} 23:59:59'`;
    } else if (startDate) {
      dateFilter = `AND timestamp >= '${startDate}'`;
    } else if (endDate) {
      dateFilter = `AND timestamp <= '${endDate} 23:59:59'`;
    } else {
      // Default to current month if no dates specified
      dateFilter = 'AND toYYYYMM(timestamp) = toYYYYMM(now())';
    }
    
    const query = `
      SELECT 
        response_model,
        SUM(total_tokens) as total_tokens,
        COUNT(*) as count
      FROM ${tableName}
      WHERE 1=1
        ${dateFilter}
        ${projectFilter}
        AND response_model IS NOT NULL
      GROUP BY response_model
      ORDER BY total_tokens DESC
    `;

    const result = await client.query({ query });
    const rawData = await result.json();
    
    // Convert string numbers to actual numbers
    const data = {
      ...rawData,
      data: rawData.data?.map((row: any) => ({
        ...row,
        total_tokens: parseInt(row.total_tokens) || 0,
        count: parseInt(row.count) || 0
      }))
    };
    
    res.json(data);
  } catch (error) {
    console.error('Token consumption query failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get conversation summaries
app.get('/api/conversations', async (req: Request, res: Response) => {
  try {
    if (!activeConnection) {
      return res.status(401).json({ error: 'No active connection' });
    }

    const { client, config } = activeConnection;
    const tableName = req.query.table || 'conversations';
    const projectFilter = config.project ? `AND project = '${config.project}'` : '';
    
    // Date filtering
    let dateFilter = '';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    if (startDate && endDate) {
      dateFilter = `AND timestamp BETWEEN '${startDate}' AND '${endDate} 23:59:59'`;
    } else if (startDate) {
      dateFilter = `AND timestamp >= '${startDate}'`;
    } else if (endDate) {
      dateFilter = `AND timestamp <= '${endDate} 23:59:59'`;
    }
    
    const query = `
      SELECT 
        interaction_id,
        any(project) as project,
        SUM(total_tokens) as total_tokens,
        any(messages) as messages,
        groupArray(response_content) as response_contents,
        max(is_tool_usage OR is_tool_callback) as tools_used,
        min(timestamp) as timestamp
      FROM ${tableName}
      WHERE 1=1 ${projectFilter} ${dateFilter}
      GROUP BY interaction_id
      ORDER BY timestamp DESC
      LIMIT 100
    `;

    const result = await client.query({ query });
    const rawData = await result.json();
    
    // Helper function to extract content from messages array
    const extractMessagesContent = (messages: any): string => {
      try {

        if (Array.isArray(messages)) {
          return messages
            .map((msg: any) => `${msg.role}: ${msg.content}`)
            .join('\n')
            .substring(0, 200) + (messages.length > 1 ? '...' : '');
        }
        return '';
      } catch {
        return '';
      }
    };

    // Helper function to extract content from response_content array
    const extractResponseContent = (responseContents: any[]): string => {
      try {
        const allContent: string[] = [];
        responseContents.forEach(response => {

            if (Array.isArray(response)) {
              response.forEach((item: any) => {
                if (item.message?.content) {
                  allContent.push(item.message.content);
                }
              });
            }

        });
        const fullContent = allContent.join(' ');
        return fullContent.length > 200 ? fullContent.substring(0, 200) + '...' : fullContent;
      } catch {
        return '';
      }
    };

    // Convert string numbers to actual numbers and extract readable content
    const data = {
      ...rawData,
      data: rawData.data?.map((row: any) => {
        const messagesContent = extractMessagesContent(row.messages);
        const responseContent = extractResponseContent(row.response_contents);
        const messagesCount = row.messages ? row.messages.length : 0;
        
        return {
          ...row,
          messages_count: messagesCount,
          messages_content: messagesContent,
          response_content: responseContent,
          total_tokens: parseInt(row.total_tokens) || 0,
          tools_used: Boolean(row.tools_used)
        };
      })
    };
    
    res.json(data);
  } catch (error) {
    console.error('Conversations query failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get conversation details
app.get('/api/conversation/:interactionId', async (req: Request, res: Response) => {
  try {
    if (!activeConnection) {
      return res.status(401).json({ error: 'No active connection' });
    }

    const { client } = activeConnection;
    const { interactionId } = req.params;
    const tableName = req.query.table || 'conversations';
    
    const query = `
      SELECT *
      FROM ${tableName}
      WHERE interaction_id = '${interactionId}'
      ORDER BY timestamp ASC
    `;

    const result = await client.query({ query });
    const rawData = await result.json();
    
    // Convert string numbers to actual numbers and parse JSON fields
    const data = {
      ...rawData,
      data: rawData.data?.map((row: any) => ({
        ...row,
        duration_ms: parseInt(row.duration_ms) || 0,
        input_tokens: parseInt(row.input_tokens) || 0,
        output_tokens: parseInt(row.output_tokens) || 0,
        total_tokens: parseInt(row.total_tokens) || 0,
        temperature: parseFloat(row.temperature) || 0,
        max_tokens: parseInt(row.max_tokens) || 0,
        top_p: parseFloat(row.top_p) || 0,
        frequency_penalty: parseFloat(row.frequency_penalty) || 0,
        presence_penalty: parseFloat(row.presence_penalty) || 0,
        stream: parseInt(row.stream) || 0,
        is_tool_callback: Boolean(row.is_tool_callback),
        is_tool_usage: Boolean(row.is_tool_usage),
        retry_count: parseInt(row.retry_count) || 0,
        metadata: row.metadata ? row.metadata : {},
      }))
    };
    
    res.json(data);
  } catch (error) {
    console.error('Conversation details query failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get available projects
app.get('/api/projects', async (req: Request, res: Response) => {
  try {
    if (!activeConnection) {
      return res.status(401).json({ error: 'No active connection' });
    }

    const { client } = activeConnection;
    const tableName = req.query.table || 'conversations';
    
    const query = `
      SELECT DISTINCT project
      FROM ${tableName}
      WHERE project IS NOT NULL AND project != ''
      ORDER BY project
    `;

    const result = await client.query({ query });
    const data = await result.json();
    
    res.json(data);
  } catch (error) {
    console.error('Projects query failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req: Request, res: Response) => {
  activeConnection = null;
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});