import { useEffect, useState } from 'react';
import { api } from '@deal-platform/shared-auth';
import type { LeaderboardEntry } from '@deal-platform/shared-types';
import { Trophy, Medal, Award } from 'lucide-react';

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCrossLeaderboard()
      .then(data => setEntries(data.leaderboard || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy size={20} className="rank-icon rank-icon--gold" />;
      case 2: return <Medal size={20} className="rank-icon rank-icon--silver" />;
      case 3: return <Award size={20} className="rank-icon rank-icon--bronze" />;
      default: return <span className="rank-number">#{rank}</span>;
    }
  };

  return (
    <div className="leaderboard-page">
      <h1 className="page-title">Leaderboard</h1>
      <p className="page-subtitle">Top investors across all games on the platform.</p>

      {loading ? (
        <div className="loading">Loading leaderboard...</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <Trophy size={48} />
          <h3>No entries yet</h3>
          <p>Play some games to get on the leaderboard!</p>
        </div>
      ) : (
        <div className="leaderboard-table">
          <div className="leaderboard-table__header">
            <span className="leaderboard-table__col--rank">Rank</span>
            <span className="leaderboard-table__col--name">Player</span>
            <span className="leaderboard-table__col--points">Points</span>
            <span className="leaderboard-table__col--games">Games</span>
          </div>
          {entries.map((entry, i) => (
            <div key={entry.user_id} className={`leaderboard-table__row ${i < 3 ? 'leaderboard-table__row--top' : ''}`}>
              <span className="leaderboard-table__col--rank">
                {getRankIcon(i + 1)}
              </span>
              <span className="leaderboard-table__col--name">
                {entry.avatar && <img src={entry.avatar} alt="" className="leaderboard-table__avatar" />}
                {entry.name}
              </span>
              <span className="leaderboard-table__col--points">
                {entry.total_points.toLocaleString()}
              </span>
              <span className="leaderboard-table__col--games">
                {entry.games_played}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
