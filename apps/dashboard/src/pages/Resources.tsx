import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Video, Lock, Star } from 'lucide-react';
import { useAuth, api } from '@deal-platform/shared-auth';
import type { Resource } from '@deal-platform/shared-types';

const TYPE_ICONS: Record<string, typeof BookOpen> = {
  guide: BookOpen,
  article: FileText,
  video: Video,
  external: ExternalLink,
};

export default function Resources() {
  const { isAuthenticated } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getResources()
      .then((data: { resources: Resource[] }) => setResources(data.resources))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading resources...</div>;

  const featured = resources.filter(r => r.is_featured);
  const rest = resources.filter(r => !r.is_featured);

  const renderCard = (resource: Resource) => {
    const Icon = TYPE_ICONS[resource.type] || FileText;
    const isLocked = !resource.content && resource.is_premium;

    return (
      <div key={resource.id} className={`resource-card ${isLocked ? 'resource-card--locked' : ''} ${resource.is_featured ? 'resource-card--featured' : ''}`}>
        {resource.is_featured && (
          <div className="resource-card__featured-badge">
            <Star size={14} /> Featured
          </div>
        )}
        <div className="resource-card__icon">
          <Icon size={24} />
        </div>
        <div className="resource-card__content">
          <h3 className="resource-card__title">{resource.title}</h3>
          {isAuthenticated ? (
            <p className="resource-card__description">{resource.description}</p>
          ) : (
            <div className="content-gate content-gate--inline">
              <Lock size={16} />
              <span>Sign in to see details</span>
              <a href="/login" className="btn btn--primary btn--xs">Sign Up</a>
            </div>
          )}

          <div className="resource-card__footer">
            <span className="resource-card__type">{resource.type}</span>
            {resource.url && !isLocked ? (
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="resource-card__link">
                Visit <ExternalLink size={14} />
              </a>
            ) : isLocked ? (
              <span className="resource-card__premium">
                <Lock size={12} /> Premium
              </span>
            ) : (
              <span className="resource-card__free">Free</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="resources-page">
      <h1 className="page-title">Learning Resources</h1>
      <p className="page-subtitle">
        Build your real estate investing knowledge with guides, articles, and expert content.
      </p>

      {featured.length > 0 && (
        <>
          <h2 className="section-title"><Star size={20} /> Featured</h2>
          <div className="resources-grid">
            {featured.map(renderCard)}
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          {featured.length > 0 && <h2 className="section-title" style={{ marginTop: '2rem' }}>All Resources</h2>}
          <div className="resources-grid">
            {rest.map(renderCard)}
          </div>
        </>
      )}

      {!isAuthenticated && (
        <div className="content-gate-banner">
          <h3>Unlock All Resources</h3>
          <p>Create a free account to access premium guides, articles, and expert content.</p>
          <a href="/login" className="btn btn--primary">Sign Up Free</a>
        </div>
      )}
    </div>
  );
}
