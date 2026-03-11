import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@deal-platform/shared-auth';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link. Please check your email and try again.');
        return;
      }

      try {
        const response = await fetch(
          `${api.getBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`
        );
        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully!');
          setTimeout(() => navigate('/login'), 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed. Please try again.');
        }
      } catch {
        setStatus('error');
        setMessage('Something went wrong. Please try again later.');
      }
    };

    verifyEmail();
  }, [token, navigate]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <a href="/" className="login-card__logo">Passive Income Club</a>
          <h1>Email Verification</h1>
        </div>

        {status === 'verifying' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p>Verifying your email...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="login-form__success" style={{ marginBottom: '16px' }}>
            {message}
            <br />
            <small>Redirecting to login...</small>
          </div>
        )}

        {status === 'error' && (
          <>
            <div className="login-form__error" style={{ marginBottom: '16px' }}>
              {message}
            </div>
            <button className="btn btn--primary btn--full" onClick={() => navigate('/login')}>
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
