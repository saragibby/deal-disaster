import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api, buildAppUrl } from '@deal-platform/shared-auth';
import { GameCard } from '@deal-platform/shared-ui';
import type { GameInfo, UserStats, LeaderboardEntry, Resource, Announcement } from '@deal-platform/shared-types';
import { Trophy, TrendingUp, Flame, Target, Star, ExternalLink, Megaphone } from 'lucide-react';

const GAMES: GameInfo[] = [
  {
    id: 'deal-or-disaster',
    name: 'Deal or Disaster',
    description: 'Master foreclosure investing by analyzing real estate auction properties. Spot red flags, calculate true costs, and decide: is it a deal or a disaster?',
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
    description: 'Buy properties, manage renovation budgets, and sell for profit. Navigate contractor issues, market shifts, and unexpected repairs.',
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
    description: 'Build a rental empire. Screen tenants, manage properties, handle maintenance emergencies, and grow your portfolio.',
    shortDescription: 'Build and manage a rental property empire',
    path: '/landlord-tycoon/',
    icon: '🏢',
    status: 'coming-soon',
    category: 'Real Estate',
    color: '#3498db',
  },
];

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([]);
  const [featuredResources, setFeaturedResources] = useState<Resource[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    // Fetch featured resources for all visitors
    api.getResources()
      .then((data: { resources: Resource[] }) =>
        setFeaturedResources(data.resources.filter(r => r.is_featured))
      )
      .catch(console.error);

    // Fetch active announcements
    api.getAnnouncements()
      .then((data: { announcements: Announcement[] }) =>
        setAnnouncements(data.announcements)
      )
      .catch(console.error);

    if (isAuthenticated) {
      api.getUserStats().then(setStats).catch(console.error);
      api.getCrossLeaderboard()
        .then((data) => setTopPlayers(data.leaderboard?.slice(0, 5) || []))
        .catch(console.error);
    }
  }, [isAuthenticated]);

  const handleGameClick = (game: GameInfo) => {
    if (game.status !== 'coming-soon') {
      window.location.href = buildAppUrl(game.path);
    }
  };

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="home__hero">
        <div className="home__hero-content">
          <h1 className="home__title">
            {isAuthenticated ? `Welcome back, ${user?.name || 'Investor'}!` : 'Master Real Estate Investing'}
          </h1>
          {!isAuthenticated && (
            <div className="home__cta">
              <button className="btn btn--primary btn--lg" onClick={() => navigate('/login')}>
                Get Started Free
              </button>
              <button className="btn btn--outline btn--lg" onClick={() => navigate('/games')}>
                Browse Games
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Announcement Banner */}
      {announcements.length > 0 && (
        <section className="home__announcement">
          <div className="announcement-banner">
            <Megaphone size={18} className="announcement-banner__icon" />
            <div className="announcement-banner__content">
              <strong className="announcement-banner__title">{announcements[0].title}</strong>
              <span className="announcement-banner__text">{announcements[0].content}</span>
            </div>
          </div>
        </section>
      )}

      {/* Quick Stats (authenticated users) */}
      {isAuthenticated && stats && (
        <section className="home__stats">
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
        </section>
      )}

      {/* All Games */}
      <section className="home__games">
        <div className="section-header">
          <h2 className="section-title">All Games</h2>
          <a href="/games" className="section-link">View All →</a>
        </div>
        <div className="game-grid">
          {GAMES.map(game => (
            <GameCard key={game.id} game={game} onClick={() => handleGameClick(game)} />
          ))}
        </div>
      </section>

      {/* Featured Resources */}
      {featuredResources.length > 0 && (
        <section className="home__featured-resources">
          <div className="section-header">
            <h2 className="section-title"><Star size={20} /> Featured Resources</h2>
            <a href="/resources" className="section-link">All Resources →</a>
          </div>
          <div className="featured-resources-grid">
            {featuredResources.map(resource => (
              <a
                key={resource.id}
                href={resource.url || `/resources/${resource.id}`}
                target={resource.url ? '_blank' : undefined}
                rel={resource.url ? 'noopener noreferrer' : undefined}
                className="featured-resource-card"
              >
                <div className="featured-resource-card__badge">
                  <Star size={14} /> Featured
                </div>
                <h3 className="featured-resource-card__title">{resource.title}</h3>
                <p className="featured-resource-card__desc">{resource.description}</p>
                <span className="featured-resource-card__cta">
                  Visit <ExternalLink size={14} />
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Top Players */}
      {topPlayers.length > 0 && (
        <section className="home__leaderboard">
          <div className="section-header">
            <h2 className="section-title">Top Players</h2>
            <a href="/leaderboard" className="section-link">Full Leaderboard →</a>
          </div>
          <div className="mini-leaderboard">
            {topPlayers.map((player, i) => (
              <div key={player.user_id} className="mini-leaderboard__row">
                <span className="mini-leaderboard__rank">#{i + 1}</span>
                <span className="mini-leaderboard__name">{player.name}</span>
                <span className="mini-leaderboard__points">{player.total_points.toLocaleString()} pts</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
