import { GameCard } from '@deal-platform/shared-ui';
import { useAuth } from '@deal-platform/shared-auth';
import type { GameInfo } from '@deal-platform/shared-types';

const ALL_GAMES: GameInfo[] = [
  {
    id: 'deal-or-disaster',
    name: 'Deal or Disaster',
    description: 'Master foreclosure investing by analyzing real estate auction properties. Spot red flags, calculate true costs, and decide: is it a deal or a disaster? Includes daily challenges, leaderboards, and an AI mentor.',
    shortDescription: 'Master foreclosure investing with real auction scenarios',
    path: '/deal-or-disaster/',
    icon: '🏠',
    status: 'live',
    category: 'Real Estate',
    color: '#e74c3c',
    is_featured: true,
  },
  {
    id: 'flip-or-flop',
    name: 'Flip or Flop',
    description: 'Buy properties, manage renovation budgets, and sell for profit. Navigate contractor issues, market shifts, and unexpected repairs. Test your ability to flip houses profitably.',
    shortDescription: 'Renovate and flip properties for maximum profit',
    path: '/flip-or-flop/',
    icon: '🔨',
    status: 'coming-soon',
    category: 'Real Estate',
    color: '#f39c12',
  },
  {
    id: 'landlord-tycoon',
    name: 'Landlord Tycoon',
    description: 'Build a rental empire from scratch. Screen tenants, manage multiple properties, handle maintenance emergencies, deal with evictions, and grow your portfolio strategically.',
    shortDescription: 'Build and manage a rental property empire',
    path: '/landlord-tycoon/',
    icon: '🏢',
    status: 'coming-soon',
    category: 'Real Estate',
    color: '#3498db',
  },
  {
    id: 'market-mayhem',
    name: 'Market Mayhem',
    description: 'Navigate real estate market cycles. Time your buys and sells, manage a portfolio through booms and busts, and learn how macroeconomics affects property values.',
    shortDescription: 'Time the market through real estate cycles',
    path: '/market-mayhem/',
    icon: '📈',
    status: 'coming-soon',
    category: 'Finance',
    color: '#2ecc71',
  },
];

export default function Games() {
  const { isAuthenticated } = useAuth();

  const handleGameClick = (game: GameInfo) => {
    if (game.status !== 'coming-soon') {
      const isDev = window.location.hostname === 'localhost';
      const gameUrl = isDev ? `http://localhost:5201${game.path}` : game.path;
      window.location.href = gameUrl;
    }
  };

  const liveGames = ALL_GAMES.filter(g => g.status === 'live' || g.status === 'beta');
  const comingSoon = ALL_GAMES.filter(g => g.status === 'coming-soon');

  return (
    <div className="games-page">
      <h1 className="page-title">Games</h1>
      <p className="page-subtitle">Learn real estate investing through interactive games and simulations.</p>

      {liveGames.length > 0 && (
        <section className="games-section">
          <h2 className="section-title">Available Now</h2>
          <div className="game-grid">
            {liveGames.map(game => (
              <GameCard key={game.id} game={game} onClick={() => handleGameClick(game)} hideDescription={!isAuthenticated} />
            ))}
          </div>
        </section>
      )}

      {comingSoon.length > 0 && (
        <section className="games-section">
          <h2 className="section-title">Coming Soon</h2>
          <div className="game-grid">
            {comingSoon.map(game => (
              <GameCard key={game.id} game={game} onClick={() => handleGameClick(game)} hideDescription={!isAuthenticated} />
            ))}
          </div>
        </section>
      )}

      {!isAuthenticated && (
        <div className="content-gate-banner">
          <h3>Sign In for Full Details</h3>
          <p>Create a free account to see game descriptions, access all features, and track your progress.</p>
          <a href="/login" className="btn btn--primary">Sign Up Free</a>
        </div>
      )}
    </div>
  );
}
