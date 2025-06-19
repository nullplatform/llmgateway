import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Conversations } from './pages/Conversations';
import { ConversationDetail } from './pages/ConversationDetail';
import { Navigation } from './components/Navigation';
import { ClickHouseConfig } from './types';
import { ClickHouseService } from './utils/clickhouse';
import { sessionStorage } from './utils/storage';

function App() {
  const [clickHouseService, setClickHouseService] = useState<ClickHouseService | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const storedConfig = sessionStorage.load();
    if (storedConfig) {
      const service = new ClickHouseService(storedConfig);
      service.testConnection().then(isConnected => {
        if (isConnected) {
          setClickHouseService(service);
          setIsAuthenticated(true);
        } else {
          sessionStorage.clear();
        }
      });
    }
  }, []);

  const handleLogin = (config: ClickHouseConfig) => {
    const service = new ClickHouseService(config);
    setClickHouseService(service);
    setIsAuthenticated(true);
    sessionStorage.save(config);
  };

  const handleLogout = async () => {
    if (clickHouseService) {
      await clickHouseService.logout();
    }
    setClickHouseService(null);
    setIsAuthenticated(false);
    sessionStorage.clear();
  };

  if (!isAuthenticated || !clickHouseService) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#f8f9fa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <Navigation onLogout={handleLogout} />
        <Routes>
          <Route path="/dashboard" element={<Dashboard clickHouseService={clickHouseService} />} />
          <Route path="/conversations" element={<Conversations clickHouseService={clickHouseService} />} />
          <Route path="/conversation/:interactionId" element={<ConversationDetail clickHouseService={clickHouseService} />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;