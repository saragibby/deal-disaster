import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email...');
  
  // In production (Heroku), use same origin. In dev, use localhost:3001
  const isProduction = window.location.hostname !== 'localhost';
  const API_URL = isProduction ? '' : 'http://localhost:3001';

  useEffect(() => {
    const verifyEmail = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link. Please check your email and try again.');
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`
        );
        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage(data.message);
          
          // Redirect to login after 3 seconds
          setTimeout(() => {
            navigate('/');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed. Please try again.');
        }
      } catch (error) {
        setStatus('error');
        setMessage('Something went wrong. Please try again later.');
      }
    };

    verifyEmail();
  }, [navigate, API_URL]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Email Verification</h2>
        
        {status === 'verifying' && (
          <div className="verification-status">
            <div className="spinner"></div>
            <p>{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="success-message">
            <p>{message}</p>
            <p style={{ marginTop: '10px', fontSize: '13px' }}>
              Redirecting you to the login page...
            </p>
          </div>
        )}

        {status === 'error' && (
          <>
            <div className="error-message">
              <p>{message}</p>
            </div>
            <button 
              className="submit-btn"
              onClick={() => navigate('/')}
              style={{ marginTop: '20px' }}
            >
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
