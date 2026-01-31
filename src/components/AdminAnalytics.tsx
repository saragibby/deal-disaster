import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import '../styles/AdminAnalytics.css';

interface TopQuestion {
  question: string;
  count: number;
  last_asked: string;
}

interface RecentQuestion {
  question: string;
  response_preview: string;
  asked_at: string;
  user_name: string;
}

interface DailyStat {
  date: string;
  question_count: number;
  unique_users: number;
}

interface User {
  id: number;
  name: string;
  email: string;
  username: string;
  is_admin: boolean;
  created_at: string;
  questions_asked: number;
  games_played: number;
  best_score: number;
}

interface Feedback {
  id: number;
  message: string;
  created_at: string;
  user_name: string;
  user_email: string;
  read: boolean;
}

interface AnalyticsData {
  topQuestions: TopQuestion[];
  recentQuestions: RecentQuestion[];
  dailyStats: DailyStat[];
  users: User[];
  feedback: Feedback[];
}

function AdminAnalytics() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'recent' | 'popular' | 'stats' | 'users' | 'feedback'>('recent');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const data = await api.getChatAnalytics();
      setAnalytics(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      // Redirect to home if not authenticated or not admin
      if (err.message.includes('Admin access required') || 
          err.message.includes('403') || 
          err.message.includes('Session expired') ||
          err.message.includes('401')) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (feedbackId: number) => {
    try {
      await api.markFeedbackAsRead(feedbackId);
      // Update local state
      if (analytics) {
        setAnalytics({
          ...analytics,
          feedback: analytics.feedback.map(fb => 
            fb.id === feedbackId ? { ...fb, read: true } : fb
          )
        });
      }
    } catch (error) {
      console.error('Error marking feedback as read:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="admin-analytics">
        <div className="analytics-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back to Home</button>
          <h1>📊 Ask Will Chat Analytics</h1>
        </div>
        <div className="loading">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
  const unreadFeedback = analytics.feedback.filter(f => !f.read).length;
    return (
      <div className="admin-analytics">
        <div className="analytics-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back to Home</button>
          <h1>📊 Ask Will Chat Analytics</h1>
        </div>
        <div className="error-message">{error}</div>
        <button onClick={fetchAnalytics} className="retry-btn">Retry</button>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const totalRegistered = analytics.users.length;
  const unreadFeedback = analytics.feedback.filter(f => !f.read).length;

  return (
    <div className="admin-analytics">
      <div className="analytics-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Back to Home</button>
        <h1>📊 Ask Will Chat Analytics</h1>
        <button className="refresh-btn" onClick={fetchAnalytics}>🔄 Refresh</button>
      </div>

      <div className="analytics-summary">
        <div className="summary-card">
          <div className="summary-number">{analytics.recentQuestions.length}</div>
          <div className="summary-label">Total Questions</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{totalRegistered}</div>
          <div className="summary-label">Registered Users</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{unreadFeedback}</div>
          <div className="summary-label">Unread Feedback</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{analytics.dailyStats.length}</div>
          <div className="summary-label">Days Active</div>
        </div>
      </div>

      <div className="analytics-tabs">
        <button
          className={`tab ${activeTab === 'recent' ? 'active' : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          Recent Questions
        </button>
        <button
          className={`tab ${activeTab === 'popular' ? 'active' : ''}`}
          onClick={() => setActiveTab('popular')}
        >
          Popular Questions
        </button>
        <button
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Daily Statistics
        </button>
        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          className={`tab ${activeTab === 'feedback' ? 'active' : ''}`}
          onClick={() => setActiveTab('feedback')}
        >
          Feedback
        </button>
      </div>

      <div className="analytics-content">
        {activeTab === 'recent' && (
          <div className="recent-questions">
            <h2>Recent Questions (Last 100)</h2>
            {analytics.recentQuestions.length === 0 ? (
              <p className="no-data">No questions asked yet.</p>
            ) : (
              <div className="questions-list">
                {analytics.recentQuestions.map((q, index) => (
                  <div key={index} className="question-item">
                    <div className="question-header">
                      <span className="user-name">{q.user_name || 'Anonymous'}</span>
                      <span className="question-time">{formatDate(q.asked_at)}</span>
                    </div>
                    <div className="question-text">{q.question}</div>
                    {q.response_preview && (
                      <div className="response-preview">
                        <strong>Response:</strong> {q.response_preview}
                        {q.response_preview.length >= 200 && '...'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'popular' && (
          <div className="popular-questions">
            <h2>Most Popular Questions</h2>
            {analytics.topQuestions.length === 0 ? (
              <p className="no-data">No questions asked yet.</p>
            ) : (
              <div className="questions-list">
                {analytics.topQuestions.map((q, index) => (
                  <div key={index} className="question-item popular">
                    <div className="question-header">
                      <span className="popularity-badge">Asked {q.count}x</span>
                      <span className="question-time">Last: {formatDate(q.last_asked)}</span>
                    </div>
                    <div className="question-text">{q.question}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="daily-stats">
            <h2>Daily Usage Statistics (Last 30 Days)</h2>
            {analytics.dailyStats.length === 0 ? (
              <p className="no-data">No statistics available yet.</p>
            ) : (
              <div className="stats-table">
                <div className="stats-header">
                  <div>Date</div>
                  <div>Questions</div>
                  <div>Unique Users</div>
                  <div>Avg Questions/User</div>
                </div>
                {analytics.dailyStats.map((stat, index) => (
                  <div key={index} className="stats-row">
                    <div>{formatDateOnly(stat.date)}</div>
                    <div>{stat.question_count}</div>
                    <div>{stat.unique_users}</div>
                    <div>{(stat.question_count / stat.unique_users).toFixed(1)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-list">
            <h2>All Users ({analytics.users.length})</h2>
            {analytics.users.length === 0 ? (
              <p className="no-data">No users found.</p>
            ) : (
              <div className="users-table">
                <div className="users-header">
                  <div>Name</div>
                  <div>Email</div>
                  <div>Username</div>
                  <div>Questions</div>
                  <div>Games</div>
                  <div>Best Score</div>
                  <div>Admin</div>
                  <div>Joined</div>
                </div>
                {analytics.users.map((user) => (
                  <div key={user.id} className="users-row">
                    <div>{user.name || '—'}</div>
                    <div className="user-email">{user.email}</div>
                    <div>{user.username || '—'}</div>
                    <div>{user.questions_asked}</div>
                    <div>{user.games_played}</div>
                    <div>{user.best_score || 0}</div>
                    <div>{user.is_admin ? '✓' : ''}</div>
                    <div>{formatDateOnly(user.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="feedback-list">
            <h2>User Feedback ({analytics.feedback.length})</h2>
            {analytics.feedback.length === 0 ? (
              <p className="no-data">No feedback submitted yet.</p>
            ) : (
              <div className="feedback-items">
                {analytics.feedback.map((fb) => (
                  <div key={fb.id} className={`feedback-item ${!fb.read ? 'unread' : ''}`}>
                    <div className="feedback-header">
                      <span className="user-name">
                        {!fb.read && <span className="unread-badge">NEW</span>}
                        {fb.user_name || 'Anonymous'}
                      </span>
                      <div className="feedback-actions">
                        <span className="feedback-time">{formatDate(fb.created_at)}</span>
                        {!fb.read && (
                          <button 
                            className="mark-read-btn"
                            onClick={() => handleMarkAsRead(fb.id)}
                            title="Mark as read"
                          >
                            ✓ Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                    {fb.user_email && (
                      <div className="user-email-small">{fb.user_email}</div>
                    )}
                    <div className="feedback-message">{fb.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminAnalytics;
