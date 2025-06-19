import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClickHouseService } from '../utils/clickhouse';
import { ConversationSummary } from '../types';

interface ConversationsProps {
  clickHouseService: ClickHouseService;
}

export const Conversations: React.FC<ConversationsProps> = ({ clickHouseService }) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await clickHouseService.getConversationSummaries();
      setConversations(data || []);
      setError('');
    } catch (err) {
      setError('Failed to load conversations: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Loading conversations...</h2>
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
        <button
          onClick={loadConversations}
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

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1>Conversations</h1>
        <p style={{ color: '#666' }}>Recent conversations with interaction details</p>
      </div>

      {conversations.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3>No conversations found</h3>
          <p style={{ color: '#666' }}>No conversation data available.</p>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Interaction ID
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Project
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Messages Content
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Response Content
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Tokens
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Tools Used
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Timestamp
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conversation, index) => (
                <tr key={conversation.interaction_id} style={{
                  backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa'
                }}>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6' }}>
                    <code style={{ 
                      backgroundColor: '#e9ecef', 
                      padding: '0.2rem 0.4rem', 
                      borderRadius: '3px',
                      fontSize: '12px'
                    }}>
                      {truncateText(conversation.interaction_id, 20)}
                    </code>
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6' }}>
                    <span style={{
                      backgroundColor: '#007bff',
                      color: 'white',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      {conversation.project}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6', maxWidth: '300px' }}>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '0.25rem' }}>
                      {conversation.messages_count} message{conversation.messages_count !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: '13px', fontFamily: 'monospace', lineHeight: '1.4' }}>
                      {truncateText(conversation.messages_content || '', 150)}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6', maxWidth: '300px' }}>
                    <div style={{ fontSize: '13px', fontFamily: 'monospace', lineHeight: '1.4' }}>
                      {truncateText(conversation.response_content || '', 150)}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6' }}>
                    {conversation.total_tokens?.toLocaleString() || 'N/A'}
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6' }}>
                    <span style={{
                      backgroundColor: conversation.tools_used ? '#28a745' : '#6c757d',
                      color: 'white',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      {conversation.tools_used ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6', fontSize: '14px' }}>
                    {formatTimestamp(conversation.timestamp)}
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #dee2e6' }}>
                    <Link
                      to={`/conversation/${conversation.interaction_id}`}
                      style={{
                        backgroundColor: '#007bff',
                        color: 'white',
                        padding: '0.3rem 0.8rem',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        fontSize: '12px'
                      }}
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};