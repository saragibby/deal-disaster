import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '@deal-platform/shared-auth';
import type { UserStats } from '@deal-platform/shared-types';
import { useTheme } from '../contexts/ThemeContext';
import { User, Mail, Trophy, Flame, Target, TrendingUp, Sun, Moon, Settings, Bell, Shield, Pencil, Check, X, Lock } from 'lucide-react';

export default function Profile() {
  const { isAuthenticated, user, updateUser, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const isEmailUser = !user?.oauth_provider || user.oauth_provider === 'email';

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    api.getUserStats().then(setStats).catch(console.error);
  }, [isAuthenticated, loading, navigate]);

  if (loading || !user) return null;

  const handleEditName = () => {
    setNameValue(user.name || '');
    setNameError('');
    setEditingName(true);
  };

  const handleCancelName = () => {
    setEditingName(false);
    setNameError('');
  };

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty');
      return;
    }
    setNameSaving(true);
    setNameError('');
    try {
      const result = await api.updateProfile({ name: trimmed, username: user.username || trimmed.replace(/\s+/g, '_').toLowerCase() });
      updateUser({ ...user, name: result.user.name });
      setEditingName(false);
    } catch (err: any) {
      setNameError(err.message || 'Failed to save');
    } finally {
      setNameSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <h1 className="page-title">My Profile</h1>

      {/* Profile Card */}
      <div className="profile-card">
        <div className="profile-card__avatar">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} />
          ) : (
            <User size={48} />
          )}
        </div>
        <div className="profile-card__info">
          {editingName ? (
            <div className="profile-card__name-edit">
              <input
                className="profile-card__name-input"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelName(); }}
                autoFocus
                disabled={nameSaving}
                maxLength={100}
              />
              <button className="profile-card__name-btn profile-card__name-btn--save" onClick={handleSaveName} disabled={nameSaving} title="Save">
                <Check size={16} />
              </button>
              <button className="profile-card__name-btn profile-card__name-btn--cancel" onClick={handleCancelName} disabled={nameSaving} title="Cancel">
                <X size={16} />
              </button>
              {nameError && <span className="profile-card__name-error">{nameError}</span>}
            </div>
          ) : (
            <div className="profile-card__name-row">
              {isEmailUser ? (
                <>
                  <h2>{user.name || 'Investor'}</h2>
                  <button className="profile-card__name-btn" onClick={handleEditName} title="Edit name">
                    <Pencil size={14} />
                  </button>
                </>
              ) : (
                <>
                  <h2 className="profile-card__name--disabled">{user.name || 'Investor'}</h2>
                  <span className="profile-card__name-lock" title={`Name is managed by ${user.oauth_provider}`}>
                    <Lock size={14} />
                  </span>
                </>
              )}
            </div>
          )}
          <p className="profile-card__email">
            <Mail size={16} /> {user.email}
          </p>
          {user.username && (
            <p className="profile-card__username">@{user.username}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="profile-stats">
          <h2 className="section-title">Your Stats</h2>
          <div className="home__stats">
            <div className="stat-card">
              <Trophy size={24} />
              <div className="stat-card__info">
                <span className="stat-card__value">{stats.lifetimePoints.toLocaleString()}</span>
                <span className="stat-card__label">Lifetime Points</span>
              </div>
            </div>
            <div className="stat-card">
              <Flame size={24} />
              <div className="stat-card__info">
                <span className="stat-card__value">{stats.currentStreak}</span>
                <span className="stat-card__label">Day Streak</span>
              </div>
            </div>
            <div className="stat-card">
              <Target size={24} />
              <div className="stat-card__info">
                <span className="stat-card__value">{stats.dealsFound}</span>
                <span className="stat-card__label">Deals Found</span>
              </div>
            </div>
            <div className="stat-card">
              <TrendingUp size={24} />
              <div className="stat-card__info">
                <span className="stat-card__value">{stats.disastersAvoided}</span>
                <span className="stat-card__label">Disasters Avoided</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="profile-settings">
        <h2 className="section-title"><Settings size={20} /> Settings</h2>

        <div className="settings-group">
          <h3 className="settings-group__title">Appearance</h3>
          <div className="settings-row">
            <div className="settings-row__label">
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              <div>
                <span className="settings-row__name">Theme</span>
                <span className="settings-row__desc">Switch between dark and light mode</span>
              </div>
            </div>
            <button
              className={`theme-toggle ${theme === 'light' ? 'theme-toggle--light' : ''}`}
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span className="theme-toggle__track">
                <Sun size={12} className="theme-toggle__icon theme-toggle__icon--light" />
                <Moon size={12} className="theme-toggle__icon theme-toggle__icon--dark" />
                <span className="theme-toggle__thumb" />
              </span>
            </button>
          </div>
        </div>

        <div className="settings-group settings-group--disabled">
          <h3 className="settings-group__title">Notifications</h3>
          <div className="settings-row">
            <div className="settings-row__label">
              <Bell size={18} />
              <div>
                <span className="settings-row__name">Email Notifications</span>
                <span className="settings-row__desc">Coming soon</span>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-group settings-group--disabled">
          <h3 className="settings-group__title">Privacy & Security</h3>
          <div className="settings-row">
            <div className="settings-row__label">
              <Shield size={18} />
              <div>
                <span className="settings-row__name">Account Security</span>
                <span className="settings-row__desc">Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="profile-actions">
        <a href={window.location.hostname === 'localhost' ? 'http://localhost:5201/deal-or-disaster/' : '/deal-or-disaster/'} className="btn btn--primary">Play Deal or Disaster</a>
      </div>
    </div>
  );
}
