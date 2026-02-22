import { useEffect, useState } from 'react';
import { api } from '@deal-platform/shared-auth';
import type { Announcement } from '@deal-platform/shared-types';
import { Megaphone, Lightbulb, Wrench } from 'lucide-react';

export default function News() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnnouncements()
      .then(data => setAnnouncements(data.announcements || []))
      .catch(() => {
        // Fallback to static announcements if API not ready
        setAnnouncements([
          {
            id: 1,
            title: 'Welcome to Passive Income Club!',
            content: 'We\'re excited to launch the new Money Man gaming platform. Start with Deal or Disaster, our flagship foreclosure investing game, and stay tuned for more games coming soon!',
            type: 'news',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 2,
            title: 'Deal or Disaster: Daily Challenges',
            content: 'New daily challenges are generated every day at midnight ET. Complete them to build your streak and climb the leaderboard!',
            type: 'tip',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 3,
            title: 'New Games in Development',
            content: 'Flip or Flop and Landlord Tycoon are currently in development. Want early access? Complete your profile and opt-in to our newsletter.',
            type: 'update',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'news': return <Megaphone size={20} />;
      case 'tip': return <Lightbulb size={20} />;
      case 'update': return <Wrench size={20} />;
      default: return <Megaphone size={20} />;
    }
  };

  return (
    <div className="news-page">
      <h1 className="page-title">News & Updates</h1>
      <p className="page-subtitle">Latest announcements, tips, and platform updates.</p>

      {loading ? (
        <div className="loading">Loading news...</div>
      ) : (
        <div className="news-list">
          {announcements.map(item => (
            <article key={item.id} className={`news-card news-card--${item.type}`}>
              <div className="news-card__icon">{getIcon(item.type)}</div>
              <div className="news-card__content">
                <div className="news-card__header">
                  <h3 className="news-card__title">{item.title}</h3>
                  <span className="news-card__type">{item.type}</span>
                </div>
                <p className="news-card__body">{item.content}</p>
                <time className="news-card__date">
                  {new Date(item.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </time>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
