import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ClickHouseService } from '../utils/clickhouse';
import { TokenConsumptionData, ClickHouseConfig } from '../types';

interface DashboardProps {
  clickHouseService: ClickHouseService;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ clickHouseService }) => {
  const [tokenData, setTokenData] = useState<TokenConsumptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [currentProject, setCurrentProject] = useState<string>('');
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');

  useEffect(() => {
    loadTokenData();
    loadCurrentProject();
    loadAvailableProjects();
  }, []);

  useEffect(() => {
    loadTokenData();
  }, [dateRange, selectedProject]);

  const loadCurrentProject = () => {
    const config = (clickHouseService as any).config as ClickHouseConfig;
    setCurrentProject(config?.project || '');
  };

  const loadAvailableProjects = async () => {
    if (!currentProject) {
      try {
        const projects = await clickHouseService.getProjects();
        setAvailableProjects(projects);
      } catch (error) {
        console.error('Failed to load projects:', error);
      }
    }
  };

  const loadTokenData = async () => {
    try {
      setLoading(true);
      const projectFilter = currentProject || selectedProject || undefined;
      const data = await clickHouseService.getTokenConsumptionByModel('conversations', dateRange.startDate, dateRange.endDate, projectFilter);
      setTokenData(data || []);
      setError('');
    } catch (err) {
      setError('Failed to load token consumption data: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (field: keyof DateRange, value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Loading dashboard...</h2>
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
          onClick={loadTokenData}
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

  const totalTokens = tokenData?.reduce((sum, item) => sum + item.total_tokens, 0);
  const totalRequests = tokenData?.reduce((sum, item) => sum + item.count, 0);

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h1>Token Consumption Dashboard</h1>
            <p style={{ color: '#666', margin: '0.5rem 0' }}>Token usage by response model</p>
            {currentProject ? (
              <div style={{ 
                display: 'inline-block',
                backgroundColor: '#e3f2fd',
                color: '#1976d2',
                padding: '0.25rem 0.75rem',
                borderRadius: '16px',
                fontSize: '14px',
                fontWeight: '500'
              }}>
                Project: {currentProject}
              </div>
            ) : availableProjects.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ fontSize: '14px', color: '#666', marginRight: '0.5rem' }}>Filter by project:</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">All Projects</option>
                  {availableProjects.map(project => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            alignItems: 'center',
            backgroundColor: 'white',
            padding: '1rem',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#666', marginBottom: '0.25rem' }}>From:</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateRangeChange('startDate', e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#666', marginBottom: '0.25rem' }}>To:</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateRangeChange('endDate', e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '14px', fontWeight: 'normal' }}>
            Total Tokens
          </h3>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>
            {totalTokens.toLocaleString()}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '14px', fontWeight: 'normal' }}>
            Total Requests
          </h3>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>
            {totalRequests.toLocaleString()}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '14px', fontWeight: 'normal' }}>
            Avg Tokens/Request
          </h3>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>
            {totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '14px', fontWeight: 'normal' }}>
            Models Used
          </h3>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>
            {tokenData.length}
          </div>
        </div>
      </div>

      {tokenData.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>Token Consumption by Model</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={tokenData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="response_model" 
                angle={-45}
                textAnchor="end"
                height={100}
                fontSize={12}
              />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toLocaleString() : value, 
                  name === 'total_tokens' ? 'Total Tokens' : 'Request Count'
                ]}
              />
              <Bar dataKey="total_tokens" fill="#8884d8" name="total_tokens" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tokenData.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3>No data available</h3>
          <p style={{ color: '#666' }}>No token consumption data found for the current month.</p>
        </div>
      )}
    </div>
  );
};