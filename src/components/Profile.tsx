import { useState, useEffect, FormEvent } from 'react';
import './Profile.css';

interface ProfileProps {
  onClose: () => void;
}

interface ProfileData {
  email: string;
  name: string;
  username: string | null;
  phone_number: string | null;
  sms_opt_in: boolean;
  email_newsletter_opt_in: boolean;
  oauth_provider: string | null;
}

export default function Profile({ onClose }: ProfileProps) {
  const isProduction = window.location.hostname !== 'localhost';
  const API_URL = isProduction ? '' : 'http://localhost:3001';

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [emailNewsletterOptIn, setEmailNewsletterOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Profile data fetched:', data);
      setProfile(data.user);
      setUsername(data.user.username || '');
      setPhoneNumber(data.user.phone_number || '');
      setSmsOptIn(data.user.sms_opt_in || false);
      setEmailNewsletterOptIn(data.user.email_newsletter_opt_in || false);
      setError(''); // Clear any previous errors
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load profile';
      setError(errorMessage);
      console.error('Profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);

    // Validate username is provided
    if (!username || username.trim() === '') {
      setError('Username is required');
      setSaving(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          phone_number: phoneNumber,
          sms_opt_in: smsOptIn,
          email_newsletter_opt_in: emailNewsletterOptIn,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Profile update error:', errorData);
        throw new Error(errorData.error || 'Failed to update profile');
      }

      const data = await response.json();
      console.log('Profile updated successfully:', data);
      setProfile(data.user);
      setMessage('Profile updated successfully!');
      setTimeout(() => {
        setMessage('');
        onClose();
      }, 1000);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to update profile';
      console.error('Profile update catch error:', err);
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-overlay">
        <div className="profile-modal">
          <div className="loading">Loading profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <h2>Profile Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="profile-form">

          <div className="form-section">
            <h3>Account Settings</h3>

            <div className="form-group">
              <label htmlFor="username">Username *</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a unique username"
                className="form-input"
                pattern="[a-zA-Z0-9_-]+"
                minLength={3}
                maxLength={50}
                required
              />
              <small className="form-hint">
                3-50 characters. Letters, numbers, hyphens, and underscores only.
              </small>
            </div>

            <div className="profile-info">
              {profile?.oauth_provider && (
                <div className="oauth-info">
                  <span className="oauth-badge">
                    {profile.oauth_provider === 'google' && '🔵 Google Account'}
                    {profile.oauth_provider === 'microsoft' && '🔷 Microsoft Account'}
                  </span>
                  <small>Account managed by {profile.oauth_provider === 'google' ? 'Google' : 'Microsoft'}. Email and name cannot be edited here.</small>
                  <div className="form-group">
                    <label>Email</label>
                    <p className="oauth-value">{profile?.email}</p>
                  </div>
                  <div className="form-group">
                    <label>Name</label>
                    <p className="oauth-value">{profile?.name}</p>
                  </div>
                </div>
              )}

              {!profile?.oauth_provider && (
                <>
                  <div className="info-item">
                    <label>Email</label>
                    <input
                      type="email"
                      value={profile?.email || ''}
                      readOnly
                      className="form-input"
                    />
                  </div>
                  <div className="info-item">
                    <label>Name</label>
                    <input
                      type="text"
                      value={profile?.name || ''}
                      readOnly
                      className="form-input"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="form-section">
            <h3>Communication Preferences</h3>

            <div className="form-group">
              <label htmlFor="phone">Mobile Number</label>
              <input
                type="tel"
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                className="form-input"
              />
              <small className="form-hint">
                Format: +1234567890 (include country code)
              </small>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  disabled={!phoneNumber}
                />
                <span>📱 Receive text message notifications</span>
              </label>
              <small className="form-hint">
                Get updates about new cases, challenges, and your leaderboard position
              </small>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={emailNewsletterOptIn}
                  onChange={(e) => setEmailNewsletterOptIn(e.target.checked)}
                />
                <span>📧 Subscribe to email newsletter</span>
              </label>
              <small className="form-hint">
                Receive foreclosure investing tips, strategies, and game updates
              </small>
            </div>
          </div>

          {message && <div className="success-message">{message}</div>}
          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
