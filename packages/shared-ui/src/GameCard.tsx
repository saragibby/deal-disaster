import type { GameInfo } from '@deal-platform/shared-types';

interface GameCardProps {
  game: GameInfo;
  onClick?: () => void;
  hideDescription?: boolean;
  iconImage?: string;
}

export function GameCard({ game, onClick, hideDescription, iconImage }: GameCardProps) {
  const statusBadge = {
    'live': { label: 'Live', className: 'game-card__badge--live' },
    'beta': { label: 'Beta', className: 'game-card__badge--beta' },
    'coming-soon': { label: 'Coming Soon', className: 'game-card__badge--coming-soon' },
  };

  const badge = statusBadge[game.status];

  return (
    <div
      className={`game-card ${game.status === 'coming-soon' ? 'game-card--disabled' : ''} ${game.is_featured ? 'game-card--featured' : ''}`}
      onClick={game.status !== 'coming-soon' ? onClick : undefined}
      style={{ '--game-color': game.color } as React.CSSProperties}
      role={game.status !== 'coming-soon' ? 'button' : undefined}
      tabIndex={game.status !== 'coming-soon' ? 0 : undefined}
    >
      {game.is_featured && (
        <div className="game-card__featured-badge">⭐</div>
      )}
      <div className="game-card__content">
        <div className="game-card__header">
          <span className="game-card__icon">
            {iconImage ? <img src={iconImage} alt={game.name} className="game-card__icon-img" /> : game.icon}
          </span>
          <h3 className="game-card__title">{game.name}</h3>
          <span className={`game-card__badge ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        {!hideDescription && <p className="game-card__description">{game.shortDescription}</p>}
        <span className="game-card__category">{game.category}</span>
      </div>
    </div>
  );
}
