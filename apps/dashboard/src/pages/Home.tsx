import { useEffect, useState } from 'react';

import { useAuth, api, buildAppUrl } from '@deal-platform/shared-auth';
import { GameCard } from '@deal-platform/shared-ui';
import type { GameInfo, UserStats, LeaderboardEntry, Resource, Tool, Announcement } from '@deal-platform/shared-types';
import { Trophy, TrendingUp, Flame, Target, Star, ExternalLink, Megaphone, Wrench, Home as HomeIcon } from 'lucide-react';
import LandingPage from './LandingPage';
import dodFavicon from '../assets/deal-or-disaster-favicon.png';

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
  const [stats, setStats] = useState<UserStats | null>(null);
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([]);
  const [featuredResources, setFeaturedResources] = useState<Resource[]>([]);
  const [featuredTools, setFeaturedTools] = useState<Tool[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<any[]>([]);

  useEffect(() => {
    // Fetch featured resources for all visitors
    api.getResources()
      .then((data: { resources: Resource[] }) =>
        setFeaturedResources(data.resources.filter(r => r.is_featured))
      )
      .catch(console.error);

    api.getTools()
      .then((data: { tools: Tool[] }) =>
        setFeaturedTools(data.tools.filter(t => t.is_featured))
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
      api.getAnalysisHistory(1, 2)
        .then((data) => setRecentAnalyses(data.analyses || []))
        .catch(console.error);
    }
  }, [isAuthenticated]);

  const handleGameClick = (game: GameInfo) => {
    if (game.status !== 'coming-soon') {
      window.location.href = buildAppUrl(game.path);
    }
  };

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="home__hero">
        <div className="home__hero-content">
          <h1 className="home__title">
            {`Welcome back, ${user?.name || 'Investor'}!`}
          </h1>
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

      {/* Recent Property Analyses */}
      {recentAnalyses.length > 0 && (
        <section className="home__recent-analyses">
          <div className="section-header">
            <h2 className="section-title"><HomeIcon size={20} /> Recent Analyses</h2>
            <a href={buildAppUrl('/property-analyzer/')} className="section-link">Property Analyzer →</a>
          </div>
          <div className="recent-analyses-grid">
            {recentAnalyses.map((a: any) => {
              const prop = a.property_data;
              const results = a.analysis_results;
              const photo = prop?.photos?.[0];
              return (
                <a
                  key={a.id}
                  href={buildAppUrl(`/property-analyzer/analysis/${a.id}`)}
                  className="recent-analysis-card"
                >
                  {photo && (
                    <div className="recent-analysis-card__img">
                      <img src={photo} alt={prop?.address} />
                    </div>
                  )}
                  <div className="recent-analysis-card__body">
                    <div className="recent-analysis-card__top">
                      <h3 className="recent-analysis-card__address">{prop?.address}</h3>
                      <span className="recent-analysis-card__location">{prop?.city}, {prop?.state} {prop?.zip}</span>
                    </div>
                    <div className="recent-analysis-card__bottom">
                      <span className="recent-analysis-card__price">${prop?.price?.toLocaleString()}</span>
                      <span className="recent-analysis-card__detail">{prop?.bedrooms}bd / {prop?.bathrooms}ba</span>
                      {prop?.sqft && <span className="recent-analysis-card__detail">{prop.sqft.toLocaleString()} sqft</span>}
                      {results?.cashFlow?.monthlyCashFlow != null && (
                        <span className={`recent-analysis-card__cashflow ${results.cashFlow.monthlyCashFlow >= 0 ? 'positive' : 'negative'}`}>
                          ${Math.round(results.cashFlow.monthlyCashFlow).toLocaleString()}/mo
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
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
            <GameCard
              key={game.id}
              game={game}
              onClick={() => handleGameClick(game)}
              iconImage={game.id === 'deal-or-disaster' ? dodFavicon : undefined}
            />
          ))}
        </div>
      </section>

      {/* Featured Tools */}
      {featuredTools.length > 0 && (
        <section className="home__featured-tools">
          <div className="section-header">
            <h2 className="section-title"><Wrench size={20} /> Featured Tools</h2>
            <a href="/tools" className="section-link">All Tools →</a>
          </div>
          <div className="featured-resources-grid">
            {featuredTools.map(tool => {
              const isInternal = tool.url?.startsWith('/');
              const href = isInternal ? buildAppUrl(tool.url!) : (tool.url || `/tools/${tool.id}`);
              return (
              <a
                key={tool.id}
                href={href}
                target={!isInternal && tool.url ? '_blank' : undefined}
                rel={!isInternal && tool.url ? 'noopener noreferrer' : undefined}
                className="featured-resource-card"
              >
                <span className="featured-resource-card__badge">⭐</span>
                <h3 className="featured-resource-card__title">{tool.icon} {tool.name}</h3>
                <p className="featured-resource-card__desc">{tool.description}</p>
                <span className="featured-resource-card__cta">
                  Open <ExternalLink size={14} />
                </span>
              </a>
              );
            })}
          </div>
        </section>
      )}

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
                <span className="featured-resource-card__badge">⭐</span>
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
