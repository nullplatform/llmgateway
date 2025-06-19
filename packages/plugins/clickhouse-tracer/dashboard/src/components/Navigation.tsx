import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavigationProps {
  onLogout: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ onLogout }) => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navItemStyle = (path: string) => ({
    display: 'inline-block',
    padding: '0.5rem 1rem',
    color: isActive(path) ? '#007bff' : '#666',
    textDecoration: 'none',
    borderRadius: '4px',
    backgroundColor: isActive(path) ? '#e7f3ff' : 'transparent',
    marginRight: '0.5rem'
  });

  return (
    <nav style={{
      backgroundColor: 'white',
      borderBottom: '1px solid #dee2e6',
      padding: '1rem 2rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ 
          margin: '0 2rem 0 0', 
          color: '#333',
          fontSize: '18px' 
        }}>LLM Dash
            board
        </h2>
        
        <div>
          <Link to="/dashboard" style={navItemStyle('/dashboard')}>
            Dashboard
          </Link>
          <Link to="/conversations" style={navItemStyle('/conversations')}>
            Conversations
          </Link>
        </div>
      </div>

      <button
        onClick={onLogout}
        style={{
          backgroundColor: '#dc3545',
          color: 'white',
          border: 'none',
          padding: '0.5rem 1rem',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        Logout
      </button>
    </nav>
  );
};