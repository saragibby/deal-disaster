import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@deal-platform/shared-auth';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email...');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  const handleResend = async (e: FormEvent) => {
    e.preventDefault();
    setResendMessage('');
    setResendError('');
    setResending(true);

    try {
      const data = await api.resendVerification(email);
      setResendMessage(data.message || 'Verification email sent! Please check your inbox.');
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Failed to resend verification email');
    } finally {
      setResending(false);
    }
  };

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
            <form onSubmit={handleResend} className="login-form">
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', textAlign: 'center', margin: '0 0 0.5rem' }}>
                Need a new link? Enter your email and we'll send another one.
              </p>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="login-form__input"
              />
              {resendError && <div className="login-form__error">{resendError}</div>}
              {resendMessage && <div className="login-form__success">{resendMessage}</div>}
              <button type="submit" className="btn btn--primary btn--full" disabled={resending}>
                {resending ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </form>
            <button className="btn btn--full" onClick={() => navigate('/login')} style={{ marginTop: '12px' }}>
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
