import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import willImage from '../assets/will.png';
import '../styles/NotFound.css';

function NotFound() {
  const navigate = useNavigate();
  const [showAskWill, setShowAskWill] = useState(false);

  return (
    <div className="not-found-container">
      <div className="not-found-content">
        <div className="not-found-header">
          <h1 className="error-code">404</h1>
          <h2>Oops! This Deal Fell Through</h2>
        </div>

        <div className="will-section">
          <img src={willImage} alt="Will the Foreclosure Expert" className="will-avatar-large" />
          <div className="will-message">
            <p className="will-quote">"Well, well, well... looks like you've wandered into a property that doesn't exist!"</p>
            <p className="will-subtext">
              Just like a bad foreclosure deal, this page has vanished into thin air. 
              But don't worry – I'm here to help you find what you're looking for.
            </p>
          </div>
        </div>

        <div className="action-buttons">
          <button className="primary-btn" onClick={() => navigate('/')}>
            🏠 Back to Home
          </button>
          <button className="secondary-btn" onClick={() => setShowAskWill(!showAskWill)}>
            💬 Ask Will for Help
          </button>
        </div>

        {showAskWill && (
          <div className="ask-will-suggestion">
            <p className="suggestion-text">
              🤔 <strong>Looking for something specific?</strong>
            </p>
            <ul className="suggestions-list">
              <li onClick={() => navigate('/')}>Play the foreclosure game</li>
              <li onClick={() => navigate('/')}>View today's daily challenge</li>
              <li onClick={() => navigate('/')}>Check the leaderboard</li>
              <li onClick={() => navigate('/')}>Update your profile</li>
            </ul>
            <p className="will-tip">
              💡 <em>Tip: Once you're logged in, click the "Ask Will" button in the bottom right to get personalized help!</em>
            </p>
          </div>
        )}

        <div className="fun-facts">
          <p className="fun-fact">
            🏚️ Fun Fact: {Math.floor(Math.random() * 100) + 1}% of foreclosure deals don't exist... just like this page!
          </p>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
