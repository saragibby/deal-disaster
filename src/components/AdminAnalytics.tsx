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

interface AnalyticsData {
  topQuestions: TopQuestion[];
  recentQuestions: RecentQuestion[];
  dailyStats: DailyStat[];
}

function AdminAnalytics() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'recent' | 'popular' | 'stats'>('recent');

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
      if (err.message.includes('Admin access required') || err.message.includes('403')) {
        setError('⛔ Access Denied: You need admin privileges to view this page.');
      } else if (err.message.includes('Session expired')) {
        setError('Your session has expired. Please log in again.');
      } else {
        setError('Failed to load analytics. Make sure you are logged in.');
      }
    } finally {
      setLoading(false);
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

  const totalUsers = new Set(analytics.recentQuestions.map(q => q.user_name)).size;

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
          <div className="summary-number">{totalUsers}</div>
          <div className="summary-label">Active Users</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{analytics.topQuestions.length}</div>
          <div className="summary-label">Unique Questions</div>
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
      </div>
    </div>
  );
}

export default AdminAnalytics;
