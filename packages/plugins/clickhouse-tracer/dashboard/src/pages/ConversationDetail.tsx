import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ClickHouseService } from '../utils/clickhouse';
import { ConversationRecord } from '../types';

interface ConversationDetailProps {
  clickHouseService: ClickHouseService;
}

interface ExecutionNode {
  record: ConversationRecord;
  children: ExecutionNode[];
  level: number;
}

export const ConversationDetail: React.FC<ConversationDetailProps> = ({ clickHouseService }) => {
  const { interactionId } = useParams<{ interactionId: string }>();
  const [records, setRecords] = useState<ConversationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (interactionId) {
      loadConversationDetails();
    }
  }, [interactionId]);

  const loadConversationDetails = async () => {
    if (!interactionId) return;
    
    try {
      setLoading(true);
      const data = await clickHouseService.getConversationDetails(interactionId);
      setRecords(data || []);
      setError('');
    } catch (err) {
      setError('Failed to load conversation details: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const buildExecutionTree = (records: ConversationRecord[]): ExecutionNode[] => {
    const nodes: ExecutionNode[] = records.map(record => ({
      record,
      children: [],
      level: 0
    }));

    const rootNodes: ExecutionNode[] = [];
    
    for (const node of nodes) {
      if (node.record.is_tool_callback) {
        const parent = nodes.find(n => 
          n.record.tool_calls?.some(tc => 
            node.record.messages.some(msg => msg.tool_call_id === tc.id)
          )
        );
        if (parent) {
          node.level = parent.level + 1;
          parent.children.push(node);
        } else {
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    }

    return rootNodes;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatJSON = (obj: any) => {
    if (!obj) return 'N/A';
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const renderExecutionNode = (node: ExecutionNode): React.ReactElement => {
    const { record } = node;
    const indentLevel = node.level * 20;

    return (
      <div key={record.request_id} style={{ marginLeft: `${indentLevel}px` }}>
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem'
            }}>
              <h3 style={{ margin: 0 }}>
                Request ID: {record.request_id}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {record.is_tool_callback && (
                  <span style={{
                    backgroundColor: '#ffc107',
                    color: '#212529',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}>
                    Tool Callback
                  </span>
                )}
                {record.is_tool_usage && (
                  <span style={{
                    backgroundColor: '#28a745',
                    color: 'white',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}>
                    Tool Usage
                  </span>
                )}
              </div>
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {formatTimestamp(record.timestamp)} | Duration: {record.duration_ms}ms
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <strong>Model:</strong> {record.response_model || record.request_model}
            </div>
            <div>
              <strong>Provider:</strong> {record.target_model_provider}
            </div>
            <div>
              <strong>Input Tokens:</strong> {record.input_tokens || 'N/A'}
            </div>
            <div>
              <strong>Output Tokens:</strong> {record.output_tokens || 'N/A'}
            </div>
            <div>
              <strong>Total Tokens:</strong> {record.total_tokens || 'N/A'}
            </div>
            <div>
              <strong>Temperature:</strong> {record.temperature || 'N/A'}
            </div>
          </div>

          {record.metadata && Object.keys(record.metadata).length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Metadata:</h4>
              <pre style={{
                backgroundColor: '#e8f4f8',
                padding: '1rem',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px',
                border: '1px solid #bee5eb'
              }}>
                {formatJSON(record.metadata)}
              </pre>
            </div>
          )}

          {record.messages && record.messages.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Messages:</h4>
              <pre style={{
                backgroundColor: '#f8f9fa',
                padding: '1rem',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {formatJSON(record.messages)}
              </pre>
            </div>
          )}

          {record.response_content && record.response_content.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Response Content:</h4>
              <pre style={{
                backgroundColor: '#f8f9fa',
                padding: '1rem',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {formatJSON(record.response_content)}
              </pre>
            </div>
          )}

          {record.tool_calls && record.tool_calls.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Tool Calls:</h4>
              <pre style={{
                backgroundColor: '#fff3cd',
                padding: '1rem',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {formatJSON(record.tool_calls)}
              </pre>
            </div>
          )}

          {record.error_message && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '1rem',
              borderRadius: '4px',
              marginTop: '1rem'
            }}>
              <strong>Error:</strong> {record.error_message}
            </div>
          )}
        </div>

        {node.children.map(child => renderExecutionNode(child))}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Loading conversation details...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          backgroundColor: '#fee',
          color: '#c33',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
        <Link to="/conversations" style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#6c757d',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginRight: '1rem'
        }}>
          Back to Conversations
        </Link>
        <button
          onClick={loadConversationDetails}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const executionTree = buildExecutionTree(records);

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/conversations" style={{
          color: '#007bff',
          textDecoration: 'none',
          fontSize: '14px'
        }}>
          ← Back to Conversations
        </Link>
        <h1 style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          Conversation Details
        </h1>
        <p style={{ color: '#666' }}>
          Interaction ID: <code>{interactionId}</code>
        </p>
      </div>

      {records.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3>No conversation data found</h3>
          <p style={{ color: '#666' }}>
            No records found for interaction ID: {interactionId}
          </p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '2rem' }}>
            <h2>Execution Tree</h2>
            <p style={{ color: '#666', fontSize: '14px' }}>
              Total records: {records.length} | 
              Showing conversation flow with tool calls and responses
            </p>
          </div>
          
          {executionTree.map(node => renderExecutionNode(node))}
        </div>
      )}
    </div>
  );
};