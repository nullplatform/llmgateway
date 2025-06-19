# ClickHouse LLM Dashboard

A React dashboard for visualizing LLM Gateway data stored in ClickHouse. This dashboard provides insights into token consumption, conversation analysis, and detailed execution trees for LLM interactions.

## Features

- **Login Screen**: Connect to ClickHouse with custom connection parameters and project filtering
- **Dashboard View**: Token consumption metrics by response model for the current month
- **Conversations View**: Table of interactions with key information (project, messages, tokens, tool usage)
- **Detailed Conversation View**: Execution tree showing the complete flow of tool calls and responses

## Prerequisites

- Node.js (version 16 or higher)
- npm or yarn
- Access to a ClickHouse instance with LLM Gateway data

## Installation

1. Navigate to the dashboard directory:
```bash
cd dashboard
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Development
The dashboard requires both a backend API server and frontend development server.

**Option 1: Start both servers together:**
```bash
npm run start:full
```

**Option 2: Start servers separately:**

Terminal 1 - Start the backend API server:
```bash
npm run server
```

Terminal 2 - Start the frontend development server:
```bash
npm run dev
```

The backend API will be available at `http://localhost:3001`
The frontend dashboard will be available at `http://localhost:3002`

### Production Build
Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Configuration

### ClickHouse Connection
On the login screen, provide:

- **ClickHouse URL**: Your ClickHouse server URL (e.g., `http://localhost:8123`)
- **Username**: ClickHouse username (optional, defaults to 'default')
- **Password**: ClickHouse password (optional)
- **Database**: Target database name (defaults to 'default')
- **Project**: Specific project to filter data (optional, leave empty for all projects)

### Database Schema
The dashboard expects a ClickHouse table with the following structure (as created by the ClickHouse tracer plugin):

```sql
CREATE TABLE conversations (
    project String,
    interaction_id String,
    request_id String,
    session_id Nullable(String),
    user_id Nullable(String),
    timestamp DateTime64,
    start_time Nullable(DateTime64),
    end_time Nullable(DateTime64),
    adapter Nullable(String),
    request_model Nullable(String),
    target_model Nullable(String),
    target_model_provider Nullable(String),
    response_model Nullable(String),
    messages Array(JSON) DEFAULT [],
    response_content Array(JSON) DEFAULT [],
    request_tools Array(JSON) DEFAULT [],
    is_tool_callback Boolean,
    is_tool_usage Boolean,
    tool_calls Array(JSON) DEFAULT [],
    duration_ms Nullable(UInt32),
    input_tokens Nullable(UInt32),
    output_tokens Nullable(UInt32),
    total_tokens Nullable(UInt32),
    temperature Nullable(Float32),
    max_tokens Nullable(UInt32),
    top_p Nullable(Float32),
    frequency_penalty Nullable(Float32),
    presence_penalty Nullable(Float32),
    stream UInt8,
    experiment_id Nullable(String),
    experiment_variant Nullable(String),
    client_ip Nullable(String),
    user_agent Nullable(String),
    headers Nullable(JSON),
    metadata Nullable(JSON),
    error_message Nullable(String),
    retry_count Nullable(UInt8),
    finish_reason Nullable(String),
    system_fingerprint Nullable(String),
    date Date MATERIALIZED toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY (project, date)
ORDER BY (interaction_id, timestamp)
```

## Dashboard Screens

### 1. Dashboard
- Displays token consumption metrics for the current month
- Shows total tokens, total requests, average tokens per request, and number of models used
- Bar chart visualization of token consumption by response model

### 2. Conversations
- Table view of recent conversations (last 100 interactions)
- Shows interaction ID, project, message count, response content preview, token usage, and tool usage
- Click "View Details" to see the full conversation execution tree

### 3. Conversation Details
- Complete execution tree for a specific interaction
- Shows all requests and responses in chronological order
- Displays tool calls, callbacks, and their relationships
- Includes full message content, response data, and metadata
- Color-coded indicators for tool callbacks and tool usage

## Key Features

- **Project Filtering**: Filter data by specific projects or view all projects
- **Real-time Data**: Connects directly to ClickHouse for up-to-date information
- **Tool Flow Visualization**: Understand complex tool call sequences
- **Token Analytics**: Track usage patterns and costs
- **Responsive Design**: Works on desktop and mobile devices

## Troubleshooting

### Connection Issues
- Verify ClickHouse server is running and accessible
- Check network connectivity and firewall settings
- Ensure credentials are correct
- Verify the database and table exist

### No Data Displayed
- Check if the table name matches (default: 'conversations')
- Verify data exists in the specified time range
- Ensure the project filter (if used) matches existing data

### Performance Issues
- Consider adding indexes for large datasets
- Use project filtering to reduce query scope
- Check ClickHouse server resources

## Dependencies

- **React 19**: UI framework
- **React Router**: Navigation and routing
- **Recharts**: Chart visualization
- **@clickhouse/client**: ClickHouse connectivity
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server

## License

MIT License - see parent project for details.