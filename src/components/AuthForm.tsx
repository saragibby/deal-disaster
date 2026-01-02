import { useEffect, useState, FormEvent } from 'react';
import './Auth.css';

interface AuthFormProps {
  onSuccess: (token: string, user: any) => void;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
  // In production (Heroku), use same origin. In dev, use localhost:3001
  const isProduction = window.location.hostname !== 'localhost';
  const API_URL = isProduction ? '' : 'http://localhost:3001';
  const [errorMessage, setErrorMessage] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Check for OAuth callback with token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userStr = params.get('user');
    const error = params.get('error');

    if (error) {
      // Show user-friendly error message
      setErrorMessage(decodeURIComponent(error));
      // Clear URL parameters
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr));
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);
        
        onSuccess(token, user);
      } catch (error) {
        console.error('Failed to parse user data:', error);
        setErrorMessage('Failed to complete authentication');
      }
    }
  }, [onSuccess]);

  const handleOAuthLogin = (provider: 'google' | 'microsoft') => {
    window.location.href = `${API_URL}/api/auth/${provider}`;
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = { email, password };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Save token to localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      onSuccess(data.token, data.user);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Welcome to Deal or Disaster</h2>
        <p className="auth-subtitle">Sign in to save your progress and compete on the leaderboard</p>
        
        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}

        {!showEmailForm ? (
          <>
            <div className="oauth-buttons">
              <button 
                className="oauth-btn google-btn" 
                onClick={() => handleOAuthLogin('google')}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <button 
                className="oauth-btn microsoft-btn" 
                onClick={() => handleOAuthLogin('microsoft')}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M13 1h10v10H13z"/>
                  <path fill="#7fba00" d="M1 13h10v10H1z"/>
                  <path fill="#ffb900" d="M13 13h10v10H13z"/>
                </svg>
                Continue with Microsoft
              </button>
            </div>

            <div className="divider">
              <span>OR</span>
            </div>

            <button 
              className="email-toggle-btn"
              onClick={() => setShowEmailForm(true)}
            >
              Continue with Email
            </button>
          </>
        ) : (
          <>
            <button 
              className="back-btn"
              onClick={() => {
                setShowEmailForm(false);
                setErrorMessage('');
              }}
            >
              ← Back to sign in options
            </button>

            <h3>{isLogin ? 'Sign In with Email' : 'Create Account'}</h3>

            <form onSubmit={handleEmailSubmit} className="email-form">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? 'Password' : 'At least 8 characters'}
                  required
                  minLength={8}
                />
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
              </button>
            </form>

            <p className="toggle-text">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button 
                type="button"
                className="toggle-link-btn" 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrorMessage('');
                }}
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </>
        )}

        <p className="privacy-note">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
