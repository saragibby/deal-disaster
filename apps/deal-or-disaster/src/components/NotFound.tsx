import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import willImage from '../assets/will.png';
import '../styles/NotFound.css';

const FORECLOSURE_FACTS = [
  "100% of 404 pages have been foreclosed on by the internet. This one included.",
  "Did you know? More people visit foreclosure auctions than their in-laws. Coincidence? We think not.",
  "The most common question at foreclosure auctions: 'Does it come with the mystery stains?'",
  "Banks hate this one weird trick: Not being on a page that exists.",
  "Studies show that 87% of statistics about foreclosures are made up on the spot. Just like this one.",
  "The word 'foreclosure' comes from the Latin 'fore' meaning 'front' and 'closure' meaning 'absolutely not happening here.'",
  "This page has been foreclosed on for failure to exist. The bank is very confused.",
  "Foreclosure auction pro tip: If you hear banjo music, it's not part of the property tour.",
  "Breaking: Local man finds page that doesn't exist, immediately tries to flip it for profit.",
  "The #1 rule of foreclosure investing: Always check if the property actually exists. Unlike this page.",
  "Will says: 'In my 20 years of foreclosure experience, I've never seen a property disappear like this page just did.'",
  "60% of foreclosure investors are just really into weird smells and questionable carpeting.",
  "This 404 error has more red flags than a foreclosure auction in a flood zone.",
  "Legend has it that somewhere, someone is still trying to flip this missing page for a profit.",
  "Foreclosure wisdom: Location, location, location... and apparently, existence, existence, existence."
];

function NotFound() {
  const navigate = useNavigate();
  const [showAskWill, setShowAskWill] = useState(false);
  const randomFact = FORECLOSURE_FACTS[Math.floor(Math.random() * FORECLOSURE_FACTS.length)];

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
          <h3 className="fun-fact-title">Foreclosure Fun Fact</h3>
          <p className="fun-fact">
            {randomFact}
          </p>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
