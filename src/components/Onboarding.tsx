import { useState, FormEvent } from 'react';
import logo from '../assets/logo.png';
import './Onboarding.css';

interface OnboardingProps {
  onComplete: (data: OnboardingData) => Promise<void>;
  userName: string;
}

interface OnboardingData {
  username: string;
  phone_number: string;
  sms_opt_in: boolean;
  email_newsletter_opt_in: boolean;
}

export default function Onboarding({ onComplete, userName }: OnboardingProps) {
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [emailNewsletterOptIn, setEmailNewsletterOptIn] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate username
    if (!username || username.trim() === '') {
      setError('Username is required');
      return;
    }

    if (username.length < 3 || username.length > 50) {
      setError('Username must be between 3 and 50 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError('Username can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    setSaving(true);

    try {
      await onComplete({
        username: username.trim(),
        phone_number: phoneNumber,
        sms_opt_in: smsOptIn,
        email_newsletter_opt_in: emailNewsletterOptIn,
      });
    } catch (error: any) {
      setError(error.message || 'Failed to save profile. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <img 
            src={logo} 
            alt="Deal or Disaster Logo" 
            className="onboarding-logo"
          />
          <h1>🎉 Welcome to Deal or Disaster!</h1>
          <p className="welcome-message">Hi {userName}! Let's get you set up.</p>
        </div>

        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="onboarding-step">
            <h2>Choose Your Username</h2>
            <p className="step-description">This is how you'll appear on the leaderboard</p>
            
            <div className="form-field">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="onboarding-input"
                pattern="[a-zA-Z0-9_-]+"
                minLength={3}
                maxLength={50}
                required
                autoFocus
              />
              <small className="field-hint">
                3-50 characters. Letters, numbers, hyphens, and underscores only.
              </small>
            </div>
          </div>

          <div className="onboarding-step">
            <h2>Communication Preferences (Optional)</h2>
            <p className="step-description">Stay updated on your progress and new challenges</p>
            
            <div className="form-field">
              <label htmlFor="onboarding-phone">Mobile Phone Number</label>
              <input
                type="tel"
                id="onboarding-phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                className="onboarding-input"
              />
              <small className="field-hint">
                Format: +1234567890 (include country code)
              </small>
            </div>

            <div className="checkbox-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  disabled={!phoneNumber}
                />
                <span>📱 Receive text message notifications</span>
              </label>
              <small className="field-hint checkbox-hint">
                Get updates about new cases, challenges, and your leaderboard position
              </small>
            </div>

            <div className="checkbox-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={emailNewsletterOptIn}
                  onChange={(e) => setEmailNewsletterOptIn(e.target.checked)}
                />
                <span>📧 Subscribe to email newsletter</span>
              </label>
              <small className="field-hint checkbox-hint">
                Receive foreclosure investing tips, strategies, and game updates
              </small>
            </div>
          </div>

          {error && <div className="onboarding-error">{error}</div>}

          <button type="submit" className="onboarding-submit" disabled={saving}>
            {saving ? 'Setting up...' : '🚀 Start Playing'}
          </button>
        </form>
      </div>
    </div>
  );
}
