import { useState, useEffect } from 'react';
import { api } from '../services/api';
import './DailyChallenge.css';

interface DailyChallengeProps {
  onStartChallenge: (challengeData: any) => void;
  onClose: () => void;
  challengeData?: any;
}

export default function DailyChallenge({ onStartChallenge, onClose, challengeData }: DailyChallengeProps) {
  const [challenge, setChallenge] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCompletion, setUserCompletion] = useState<any>(null);

  useEffect(() => {
    if (challengeData) {
      // Handle different data structures
      let challengeObj = challengeData.challenge || challengeData;
      
      // Ensure challenge_date is set
      if (!challengeObj.challenge_date && challengeObj.date) {
        challengeObj.challenge_date = challengeObj.date;
      }
      
      // Normalize the challenge data structure
      if (challengeObj && !challengeObj.property_data) {
        // Data from getDailyChallengeByDate - properties are at root level
        challengeObj = {
          ...challengeObj,
          challenge_date: challengeObj.challenge_date || challengeObj.date,
          property_data: {
            city: challengeObj.city,
            state: challengeObj.state,
            propertyType: challengeObj.propertyType || 'Single Family',
            auctionPrice: challengeObj.auctionPrice,
            estimatedRepairs: challengeObj.estimatedRepairs,
            estimatedValue: challengeObj.estimatedValue,
            address: challengeObj.address,
            zipCode: challengeObj.zipCode,
            liens: challengeObj.liens || [],
            redFlags: challengeObj.redFlags || [],
            photos: challengeObj.photos || [],
            funnyStory: challengeObj.funnyStory || challengeObj.description,
            occupancyStatus: challengeObj.occupancyStatus || 'unknown',
            hoaFees: challengeObj.hoaFees,
            actualValue: challengeObj.actualValue || challengeObj.estimatedValue,
            isGoodDeal: challengeObj.isGoodDeal
          }
        };
      }
      
      console.log('Challenge object:', challengeObj);
      console.log('Challenge date:', challengeObj.challenge_date);
      
      setChallenge(challengeObj);
      setUserCompletion(challengeData.user_completion || challengeData.completion);
      setLoading(false);
    } else {
      fetchTodaysChallenge();
    }
  }, [challengeData]);

  const fetchTodaysChallenge = async () => {
    try {
      setLoading(true);
      const data = await api.getDailyChallenge();
      setChallenge(data.challenge);
      setUserCompletion(data.user_completion);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching daily challenge:', err);
      setError(err.message || 'Failed to load daily challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleStartChallenge = () => {
    if (challenge) {
      onStartChallenge(challenge);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Invalid date';
    
    try {
      // Handle different date formats
      // Extract just the date part if it includes timestamp (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
      const datePart = dateString.split('T')[0];
      const parts = datePart.split('-');
      
      if (parts.length !== 3) return 'Invalid date';
      
      const [year, month, day] = parts.map(Number);
      
      // Validate the parsed values
      if (isNaN(year) || isNaN(month) || isNaN(day)) return 'Invalid date';
      if (month < 1 || month > 12) return 'Invalid date';
      if (day < 1 || day > 31) return 'Invalid date';
      
      const date = new Date(year, month - 1, day);
      if (isNaN(date.getTime())) return 'Invalid date';
      
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="daily-challenge-overlay">
        <div className="daily-challenge-modal">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading today's challenge...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="daily-challenge-overlay">
        <div className="daily-challenge-modal">
          <button className="close-btn" onClick={onClose}>×</button>
          <div className="error-state">
            <h2>😕 Oops!</h2>
            <p>{error}</p>
            <button className="retry-btn" onClick={fetchTodaysChallenge}>
              Try Again
            </button>
            <button className="secondary-btn" onClick={onClose}>
              Play Regular Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!challenge || !challenge.property_data) {
    return (
      <div className="daily-challenge-overlay">
        <div className="daily-challenge-modal">
          <button className="close-btn" onClick={onClose}>×</button>
          <div className="error-state">
            <h2>😕 Challenge Not Available</h2>
            <p>This challenge could not be loaded.</p>
            <button className="secondary-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-challenge-overlay">
      <div className="daily-challenge-modal">
        <button className="close-btn" onClick={onClose}>×</button>
        
        <div className="daily-challenge-header">
          <div className="challenge-badge">
            <span className="badge-icon">🌟</span>
            <span className="badge-text">Daily Challenge</span>
          </div>
          <h2 className="challenge-title">Today's Foreclosure Scenario</h2>
          <p className="challenge-date">{formatDate(challenge.challenge_date || challenge.date)}</p>
        </div>

        {userCompletion ? (
          <div className="completion-status">
            <div className="completion-header">
              <h3>✅ Challenge Completed!</h3>
              <p className="completion-message">You've already completed today's challenge.</p>
            </div>
            
            <div className="completion-stats">
              <div className="stat-item">
                <span className="stat-label">Your Decision</span>
                <span className="stat-value decision-badge">{userCompletion.decision}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Points Earned</span>
                <span className="stat-value points-earned">+{userCompletion.points_earned}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Time Taken</span>
                <span className="stat-value">{Math.floor(userCompletion.time_taken / 60)}m {userCompletion.time_taken % 60}s</span>
              </div>
            </div>

            <div className="completion-actions">
              <button className="primary-btn" onClick={handleStartChallenge}>
                Play Again (For Practice)
              </button>
              <button className="secondary-btn" onClick={onClose}>
                Play Regular Game
              </button>
            </div>

            <p className="next-challenge-note">
              ⏰ Next challenge available tomorrow at 12:01 AM
            </p>
          </div>
        ) : (
          <div className="challenge-preview">
            <div className="preview-info">
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-icon">🏘️</span>
                  <div className="info-content">
                    <span className="info-label">Location</span>
                    <span className="info-value">
                      {challenge.property_data.city}, {challenge.property_data.state}
                    </span>
                  </div>
                </div>
                <div className="info-item">
                  <span className="info-icon">🏠</span>
                  <div className="info-content">
                    <span className="info-label">Property Type</span>
                    <span className="info-value">{challenge.property_data.propertyType}</span>
                  </div>
                </div>
                <div className="info-item">
                  <span className="info-icon">💰</span>
                  <div className="info-content">
                    <span className="info-label">Auction Price</span>
                    <span className="info-value">
                      ${challenge.property_data.auctionPrice.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="info-item">
                  <span className="info-icon">🔨</span>
                  <div className="info-content">
                    <span className="info-label">Est. Repairs</span>
                    <span className="info-value">
                      ${challenge.property_data.estimatedRepairs.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="difficulty-badge">
                Difficulty: <strong className="difficulty-text">{challenge.difficulty?.toUpperCase() || 'MEDIUM'}</strong>
              </div>
            </div>

            <div className="challenge-description">
              <h3>🎯 Your Mission</h3>
              <p>
                Analyze this unique foreclosure scenario generated by AI. You'll have 3 minutes 
                to review the property details, identify red flags, and make your decision: 
                BUY, INVESTIGATE, or WALK AWAY.
              </p>
              <div className="challenge-rewards">
                <div className="reward-item">
                  <span className="reward-icon">✨</span>
                  <span>Earn bonus points for daily challenges</span>
                </div>
                <div className="reward-item">
                  <span className="reward-icon">🏆</span>
                  <span>Compete on the daily leaderboard</span>
                </div>
                <div className="reward-item">
                  <span className="reward-icon">📊</span>
                  <span>Track your progress over time</span>
                </div>
              </div>
            </div>

            <div className="challenge-actions">
              <button className="start-challenge-btn" onClick={handleStartChallenge}>
                🚀 Start Daily Challenge
              </button>
              <button className="alt-game-btn" onClick={onClose}>
                Play Regular Game Instead
              </button>
            </div>

            <p className="one-per-day-note">
              💡 You can only complete this challenge once per day for points
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
