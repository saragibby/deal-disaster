import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Video, Lock, Star, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth, api } from '@deal-platform/shared-auth';
import type { Resource } from '@deal-platform/shared-types';
import {
  ResourceFormFields, InlineForm, AdminOverlay,
  EMPTY_RESOURCE, type ResourceFormData,
} from '../components/AdminInlineForm';

const TYPE_ICONS: Record<string, typeof BookOpen> = {
  guide: BookOpen,
  article: FileText,
  video: Video,
  external: ExternalLink,
};

export default function Resources() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState<ResourceFormData>(EMPTY_RESOURCE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function loadResources() {
    setLoading(true);
    api.getResources()
      .then((data: { resources: Resource[] }) => setResources(data.resources))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadResources(); }, []);

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_RESOURCE);
    setShowNewForm(true);
    setError('');
  }

  function startEdit(r: Resource) {
    setShowNewForm(false);
    setEditingId(r.id);
    setForm({
      title: r.title, description: r.description, content: r.content || '',
      type: r.type, url: r.url || '', category: r.category,
      is_premium: r.is_premium, is_featured: r.is_featured, sort_order: r.sort_order,
    });
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNewForm(false);
    setError('');
  }

  async function saveResource() {
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.updateResource(editingId, form);
      } else {
        await api.createResource(form);
      }
      cancelEdit();
      loadResources();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteResource(id: number) {
    if (!confirm('Delete this resource?')) return;
    try {
      await api.deleteResource(id);
      loadResources();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  }

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

        {isAdmin && (
          <div className="admin-card-controls">
            <button className="admin-card-btn" onClick={(e) => { e.stopPropagation(); startEdit(resource); }} title="Edit">
              <Pencil size={14} />
            </button>
            <button className="admin-card-btn admin-card-btn--danger" onClick={(e) => { e.stopPropagation(); deleteResource(resource.id); }} title="Delete">
              <Trash2 size={14} />
            </button>
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
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Learning Resources</h1>
          <p className="page-subtitle">
            Build your real estate investing knowledge with guides, articles, and expert content.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn--primary btn--sm" onClick={startNew}>
            <Plus size={16} /> Add Resource
          </button>
        )}
      </div>

      {error && <div className="admin-error">{error}</div>}

      {/* Admin overlay for new/edit forms */}
      {(showNewForm || editingId !== null) && (
        <AdminOverlay onClose={cancelEdit}>
          <InlineForm
            title={editingId ? 'Edit Resource' : 'New Resource'}
            saving={saving}
            onSave={saveResource}
            onCancel={cancelEdit}
          >
            {error && <div className="admin-error">{error}</div>}
            <ResourceFormFields form={form} setForm={setForm} />
          </InlineForm>
        </AdminOverlay>
      )}

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

      {resources.length === 0 && isAdmin && (
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          <p>No resources yet. Click "Add Resource" to create the first one.</p>
        </div>
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
