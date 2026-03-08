import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, buildAppUrl } from '@deal-platform/shared-auth';
import type { GameInfo, Resource, Tool } from '@deal-platform/shared-types';
import '../styles/landing.css';

interface LandingData {
  games: GameInfo[];
  resources: Resource[];
  tools: Tool[];
}

const STATUS_BADGES: Record<string, string> = {
  live: 'Live',
  beta: 'Beta',
  'coming-soon': 'Coming Soon',
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<LandingData>({ games: [], resources: [], tools: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLandingData()
      .then((d: LandingData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const liveGames = data.games.filter(g => g.status === 'live' || g.status === 'beta');
  const comingSoonGames = data.games.filter(g => g.status === 'coming-soon');

  return (
    <div className="landing">
      {/* ---- NAV ---- */}
      <nav className="landing__nav">
        <div className="landing__nav-logo">
          PIC<span> — Passive Income Club</span>
        </div>
        <div className="landing__nav-right">
          <button className="landing__nav-signin" onClick={() => navigate('/login')}>
            Member Sign In
          </button>
          <a href="https://www.joinpic.club/yes" className="landing__nav-cta">
            Join Now — $997/yr
          </a>
        </div>
      </nav>

      {/* ---- HERO ---- */}
      <section className="landing__hero">
        <div className="landing__hero-bg" />
        <div className="landing__hero-eyebrow">Money Man Myers Presents</div>
        <h1 className="landing__hero-title">
          Stop <span className="accent">Missing</span><br />
          Your Life
        </h1>
        <p className="landing__hero-sub">
          America's #1 membership to help you get financially free faster — through passive
          income assets that pay your bills, so you can start <em>living</em> now.
        </p>
        <div className="landing__hero-price">
          <span className="old">$3,564/yr</span>
          <span className="new">$997/yr</span>
          <span className="tag">72% Off</span>
        </div>
        <div className="landing__hero-actions">
          <a href="https://www.joinpic.club/yes" className="landing-btn landing-btn--primary">
            Join The Club
          </a>
          <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/login')}>
            Member Login
          </button>
        </div>
      </section>

      {/* ---- TICKER ---- */}
      <div className="landing__ticker">
        <div className="landing__ticker-inner">
          {['Airbnb Cash Flow', 'Real Estate', 'Vending Machines', 'Storage Units', 'Raw Land',
            'Laundromats', 'Ice Machines', 'Passive Business Building', 'Parking Lots', 'Financial Freedom',
            'Airbnb Cash Flow', 'Real Estate', 'Vending Machines', 'Storage Units', 'Raw Land',
            'Laundromats', 'Ice Machines', 'Passive Business Building', 'Parking Lots', 'Financial Freedom',
          ].map((text, i) => (
            <span key={i}>{text}<span className="dot"> ✦ </span></span>
          ))}
        </div>
      </div>

      {/* ---- STORY ---- */}
      <section className="landing__story">
        <div className="landing__story-label">Why This Club Exists</div>
        <h2>I Missed My Son's<br />First Steps.</h2>
        <p>
          I was sitting in a cubicle. Stuck at a job that made me miserable. While my wife sent texts
          of the moment that would never happen again.
        </p>
        <p>
          Sound familiar? Whether you're the one stuck in meetings, or buried in client work running
          your own business — if your time isn't your own, you're missing it all.
        </p>
        <div className="landing__callout">
          "Why would I sacrifice 40 years of my time… just to get 13 years of freedom at the end?
          The average retirement age is 65. Life expectancy is 78. Do the math."
          <br /><br />— Will Myers, AKA Money Man Myers
        </div>
        <p>
          At 29 years old, I became 100% financially free by acquiring passive income producing
          assets and stacking them until they outearned my living expenses. Then I quit and built
          this club to help you do the same — in 5–10 years, not 40.
        </p>
      </section>

      {/* ---- STATS ---- */}
      <div className="landing__stats">
        <div className="landing__stats-inner">
          <div className="landing__stat">
            <div className="landing__stat-number">$500+</div>
            <div className="landing__stat-label">Avg. monthly cash flow on first asset</div>
          </div>
          <div className="landing__stat">
            <div className="landing__stat-number">5–10</div>
            <div className="landing__stat-label">Years to financial freedom (not 40)</div>
          </div>
          <div className="landing__stat">
            <div className="landing__stat-number">72%</div>
            <div className="landing__stat-label">Off regular price, locked in forever</div>
          </div>
          <div className="landing__stat">
            <div className="landing__stat-number">$75K</div>
            <div className="landing__stat-label">Value of 1:1 private coaching per year</div>
          </div>
        </div>
      </div>

      {/* ---- WHAT YOU GET ---- */}
      <section className="landing__section">
        <div className="landing__section-header">
          <div className="landing__eyebrow">Everything Inside</div>
          <h2>Your Complete<br />Toolkit For Freedom</h2>
        </div>
        <div className="landing__cards-grid">
          <div className="landing__card">
            <div className="landing__card-number">01</div>
            <div className="landing__card-icon">🎓</div>
            <h3>7 Steps to Freedom Foundations Course</h3>
            <p>My complete blueprint for acquiring your first — or next — passive income asset. Minimize taxes legally, find your freedom number, pick the right asset, fund the deal, and close.</p>
            <span className="landing__tag-pill">Instant Access</span>
          </div>
          <div className="landing__card">
            <div className="landing__card-number">02</div>
            <div className="landing__card-icon">📚</div>
            <h3>Passive Income Asset Library</h3>
            <p>A new deep-dive training every month on a different asset type — Airbnb, long-term rentals, vending machines, storage units, laundromats, and more.</p>
            <span className="landing__tag-pill">Growing Monthly</span>
          </div>
          <div className="landing__card">
            <div className="landing__card-number">03</div>
            <div className="landing__card-icon">📞</div>
            <h3>Twice-Monthly Live Q&A Calls</h3>
            <p>Bring your deals. Bring your questions. I'll crunch the numbers live with you. One call to ask, one week to act.</p>
            <span className="landing__tag-pill">Every 2 Weeks</span>
          </div>
          <div className="landing__card">
            <div className="landing__card-number">04</div>
            <div className="landing__card-icon">💬</div>
            <h3>24/7 Community Access</h3>
            <p>Connect with hundreds of fellow financial freedom builders. No ads, no algorithm. Just people stacking assets and holding each other accountable.</p>
            <span className="landing__tag-pill">Always On</span>
          </div>
        </div>
      </section>

      {/* ---- ASK WILL AI ---- */}
      <section className="landing__ask-will">
        <div className="landing__ask-will-inner">
          <div className="landing__ask-will-text">
            <div className="landing__eyebrow landing__eyebrow--green">AI-Powered Member Tool</div>
            <h2>Meet <span className="accent">Ask Will</span> — Your 24/7 AI Financial Freedom Coach</h2>
            <p>Can't wait for the next live call? Ask Will is an AI chat assistant trained on Will Myers' entire philosophy, frameworks, and strategies.</p>
            <ul className="landing__feature-list">
              <li><span className="check">✓</span> Analyze any deal and run cash flow math instantly</li>
              <li><span className="check">✓</span> Get asset-specific guidance for your situation</li>
              <li><span className="check">✓</span> Ask anything at 2am — and get a real answer</li>
              <li><span className="check">✓</span> Trained on Will's frameworks &amp; the PIC curriculum</li>
              <li><span className="check">✓</span> Exclusive to Passive Income Club members</li>
            </ul>
            <a href="https://www.joinpic.club/yes" className="landing-btn landing-btn--primary">Unlock Ask Will AI</a>
          </div>
          <div className="landing__chat-mockup">
            <div className="landing__chat-header">
              <div className="landing__chat-avatar">W</div>
              <div>
                <div className="landing__chat-name">Ask Will AI</div>
                <div className="landing__chat-status">● Online — Members Only</div>
              </div>
            </div>
            <div className="landing__chat-body">
              <div className="landing__chat-msg landing__chat-msg--user">
                I found a duplex for $220K. Rent would be $1,800/mo. Does it cash flow?
              </div>
              <div className="landing__chat-msg landing__chat-msg--ai">
                <div className="landing__msg-label">Ask Will</div>
                Let's run the numbers. At 20% down ($44K) and 7% interest, your mortgage is ~$1,175/mo.
                Add taxes, insurance, vacancy (~$350), you're at ~$1,525 in expenses.
                That's roughly <strong>$275/mo profit</strong>. It cash flows — but barely.
                Want to see how to negotiate the price or find better financing to widen that margin?
              </div>
              <div className="landing__chat-msg landing__chat-msg--user">
                Yes! What's the best strategy here?
              </div>
              <div className="landing__chat-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- TOOLS (Dynamic) ---- */}
      {!loading && data.tools.length > 0 && (
        <section className="landing__section">
          <div className="landing__section-header">
            <div className="landing__eyebrow">Member Tools</div>
            <h2>Tools That Do<br />The Math For You</h2>
          </div>
          <div className="landing__tools-grid">
            {data.tools.map(tool => (
              <div key={tool.id} className="landing__tool-card">
                <div className="landing__tool-emoji">{tool.icon}</div>
                <h4>{tool.name}</h4>
                <p>{tool.description}</p>
                {tool.is_premium && <span className="landing__tag-pill landing__tag-pill--premium">🔒 Members Only</span>}
              </div>
            ))}
          </div>
          <div className="landing__section-cta">
            <a href="https://www.joinpic.club/yes" className="landing-btn landing-btn--primary">
              Unlock All Tools
            </a>
          </div>
        </section>
      )}

      {/* ---- FEATURED RESOURCES (Dynamic) ---- */}
      {!loading && data.resources.length > 0 && (
        <section className="landing__section landing__section--alt">
          <div className="landing__section-header">
            <div className="landing__eyebrow">Member Resources</div>
            <h2>Curated Learning<br />Resources</h2>
          </div>
          <div className="landing__tools-grid">
            {data.resources.map(resource => (
              <div key={resource.id} className="landing__tool-card">
                <div className="landing__tool-emoji">
                  {resource.type === 'video' ? '🎬' : resource.type === 'guide' ? '📖' : resource.type === 'external' ? '🔗' : '📄'}
                </div>
                <h4>{resource.title}</h4>
                <p>{resource.description}</p>
                {resource.is_premium && <span className="landing__tag-pill landing__tag-pill--premium">🔒 Members Only</span>}
              </div>
            ))}
          </div>
          <div className="landing__section-cta">
            <a href="https://www.joinpic.club/yes" className="landing-btn landing-btn--primary">
              Get Full Access
            </a>
          </div>
        </section>
      )}

      {/* ---- GAMES (Dynamic) ---- */}
      <section className="landing__games">
        <div className="landing__section-header">
          <div className="landing__eyebrow">Learn While You Play</div>
          <h2>Games That Build<br />Financial Intelligence</h2>
        </div>

        {!loading && (
          <>
            <div className="landing__games-grid">
              {[...liveGames, ...comingSoonGames].map((game) => (
                <div
                  key={game.id}
                  className={`landing__game-card ${game.status === 'coming-soon' ? 'landing__game-card--soon' : ''}`}
                >
                  <div className="landing__game-visual" style={{ background: `linear-gradient(135deg, ${game.color}22, ${game.color}44)` }}>
                    <span className="landing__game-emoji">{game.icon}</span>
                    <span className="landing__game-badge">{STATUS_BADGES[game.status] || game.status}</span>
                  </div>
                  <div className="landing__game-info">
                    <h4>{game.name}</h4>
                    <p>{game.shortDescription}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="landing__section-cta">
              <a href="https://www.joinpic.club/yes" className="landing-btn landing-btn--primary">
                Play As A Member
              </a>
            </div>
          </>
        )}
      </section>

      {/* ---- SOCIAL PROOF ---- */}
      <section className="landing__social-proof">
        <div className="landing__section-header">
          <div className="landing__eyebrow">Member Wins</div>
          <h2>Real People,<br />Real Assets</h2>
        </div>
        <div className="landing__testimonials">
          <div className="landing__testimonial">
            <div className="landing__testimonial-text">
              "Bought my first vending machine 3 months in. <span className="highlight">$700/month profit</span> with almost zero work. I literally check it once a week."
            </div>
            <div className="landing__testimonial-author">
              <div className="landing__author-avatar" style={{ background: '#F0C040' }}>K</div>
              <div>
                <div className="landing__author-name">Kyle M.</div>
                <div className="landing__author-asset">🏪 Self Storage + Vending</div>
              </div>
            </div>
          </div>
          <div className="landing__testimonial">
            <div className="landing__testimonial-text">
              "I was terrified to buy my first Airbnb. Will's course made it simple. Now it's <span className="highlight">paying $1,100/mo</span> above my mortgage."
            </div>
            <div className="landing__testimonial-author">
              <div className="landing__author-avatar" style={{ background: '#FF6B6B' }}>L</div>
              <div>
                <div className="landing__author-name">Lisa T.</div>
                <div className="landing__author-asset">🏡 Airbnb — Asheville, NC</div>
              </div>
            </div>
          </div>
          <div className="landing__testimonial">
            <div className="landing__testimonial-text">
              "Bought raw land I found through the club. <span className="highlight">Sold it 6 months later for $40K profit</span>. Reinvested in a duplex."
            </div>
            <div className="landing__testimonial-author">
              <div className="landing__author-avatar" style={{ background: '#00E87A' }}>R</div>
              <div>
                <div className="landing__author-name">Reggie D.</div>
                <div className="landing__author-asset">🌿 Raw Land → Duplex</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- PRICING ---- */}
      <section className="landing__pricing" id="join">
        <div className="landing__section-header">
          <div className="landing__eyebrow">Simple Pricing</div>
          <h2>One Club.<br />Everything Inside.</h2>
        </div>
        <div className="landing__pricing-card">
          <div className="landing__pricing-badge">Founder's Rate — Grandfathered Forever</div>
          <div className="landing__pricing-old">$3,564/year normally</div>
          <div className="landing__pricing-price"><span>$</span>997</div>
          <div className="landing__pricing-period">per year — cancel anytime</div>
          <div className="landing__pricing-includes">
            <h4>Everything included:</h4>
            <div className="landing__include-item"><span className="check">✦</span> 7 Steps To Freedom Foundations Course</div>
            <div className="landing__include-item"><span className="check">✦</span> Passive Income Asset Library (+ monthly additions)</div>
            <div className="landing__include-item"><span className="check">✦</span> Twice-Monthly Live Q&A Calls with Will Myers</div>
            <div className="landing__include-item"><span className="check">✦</span> 24/7 Community Access on Circle</div>
            <div className="landing__include-item"><span className="check">✦</span> Ask Will AI Chat — Your 24/7 financial coach</div>
            <div className="landing__include-item"><span className="check">✦</span> Cash Flow Calculator + All Tools</div>
            <div className="landing__include-item"><span className="check">✦</span> Games &amp; Learning Simulations</div>
            <div className="landing__include-item"><span className="check">✦</span> All 3 Bonus Trainings ($791 value)</div>
          </div>
          <a href="https://www.joinpic.club/yes" className="landing-btn landing-btn--primary landing-btn--full">
            Join Passive Income Club — $997/yr
          </a>
          <div className="landing__pricing-guarantee">
            🔒 No contracts. Cancel anytime by emailing info@moneymanmyers.com at least 3 days before renewal. Immediate access to all content upon joining.
          </div>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section className="landing__faq">
        <div className="landing__section-header">
          <div className="landing__eyebrow">Common Questions</div>
          <h2>Got Questions?</h2>
        </div>
        <div className="landing__faq-list">
          <div className="landing__faq-item">
            <div className="landing__faq-q">How quickly can I get my first passive income asset?</div>
            <div className="landing__faq-a">You could have your first asset within weeks if you move fast. The 7 Steps course walks you through everything step-by-step. Many members close their first deal within their first 2–3 months.</div>
          </div>
          <div className="landing__faq-item">
            <div className="landing__faq-q">How much money do I need to start?</div>
            <div className="landing__faq-a">You can buy a used vending machine for around $1,000. A 20% down payment on a $125K duplex is $25,000. But funding isn't always cash — the bonus training covers 7 ways to find the money even if you don't have it in the bank today.</div>
          </div>
          <div className="landing__faq-item">
            <div className="landing__faq-q">What if real estate is too expensive or rates are too high in my area?</div>
            <div className="landing__faq-a">Real estate is just one of many asset types in the club. Vending machines, storage units, laundromats, parking lots, passive businesses — there are assets that work regardless of the interest rate environment or where you live.</div>
          </div>
          <div className="landing__faq-item">
            <div className="landing__faq-q">What if I want to cancel?</div>
            <div className="landing__faq-a">No contracts, no drama. Just email info@moneymanmyers.com at least 3 days before your next billing date and you'll never be charged again. Simple.</div>
          </div>
          <div className="landing__faq-item">
            <div className="landing__faq-q">What is Ask Will AI exactly?</div>
            <div className="landing__faq-a">Ask Will is an AI assistant trained on Will's frameworks, curriculum, and strategies. Available 24/7, it can help you analyze deals, calculate cash flow, pick asset types, and answer any financial freedom question — instantly, any time of day.</div>
          </div>
        </div>
      </section>

      {/* ---- FINAL CTA ---- */}
      <section className="landing__final-cta">
        <h2>The Years Pass<br /><span className="accent">Either Way.</span></h2>
        <p>Would you rather spend the next 5–10 years building freedom — or hoping the traditional path works out in 40 more years?</p>
        <div className="landing__final-actions">
          <a href="https://www.joinpic.club/yes" className="landing-btn landing-btn--primary">
            Join The Club — Start Today
          </a>
          <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/login')}>
            Already a Member? Sign In
          </button>
        </div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="landing__footer">
        <div className="landing__footer-logo">Passive Income Club</div>
        <p>
          Money Man Myers LLC. This is an educational program only. Not investment, tax, or legal advice.
          Results are not typical or guaranteed. Only 5% of the US population achieves financial freedom —
          success requires knowledge, due diligence, and consistent action. Please consult a qualified
          financial advisor before making investment decisions.
        </p>
      </footer>
    </div>
  );
}
