import { useEffect, useState } from 'react';
import { useAuth, api } from '@deal-platform/shared-auth';
import type { Announcement } from '@deal-platform/shared-types';
import { Megaphone, Lightbulb, Wrench, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  AnnouncementFormFields, InlineForm, AdminOverlay,
  EMPTY_ANNOUNCEMENT, type AnnouncementFormData,
} from '../components/AdminInlineForm';

export default function News() {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState<AnnouncementFormData>(EMPTY_ANNOUNCEMENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function loadAnnouncements() {
    setLoading(true);
    // Admins see all (including inactive), regular users see active only
    const fetcher = isAdmin ? api.getAdminAnnouncements() : api.getAnnouncements();
    fetcher
      .then(data => setAnnouncements(data.announcements || []))
      .catch(() => {
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
  }

  useEffect(() => { loadAnnouncements(); }, []);

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_ANNOUNCEMENT);
    setShowNewForm(true);
    setError('');
  }

  function startEdit(a: Announcement) {
    setShowNewForm(false);
    setEditingId(a.id);
    setForm({
      title: a.title, content: a.content, type: a.type, is_active: a.is_active,
    });
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNewForm(false);
    setError('');
  }

  async function saveAnnouncement() {
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.updateAnnouncement(editingId, form);
      } else {
        await api.createAnnouncement(form);
      }
      cancelEdit();
      loadAnnouncements();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement(id: number) {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.deleteAnnouncement(id);
      loadAnnouncements();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  }

  async function toggleActive(a: Announcement) {
    try {
      await api.updateAnnouncement(a.id, { is_active: !a.is_active });
      loadAnnouncements();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

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
      <div className="page-header-row">
        <div>
          <h1 className="page-title">News & Updates</h1>
          <p className="page-subtitle">Latest announcements, tips, and platform updates.</p>
        </div>
        {isAdmin && (
          <button className="btn btn--primary btn--sm" onClick={startNew}>
            <Plus size={16} /> Add Announcement
          </button>
        )}
      </div>

      {error && <div className="admin-error">{error}</div>}

      {/* Admin overlay for new/edit forms */}
      {(showNewForm || editingId !== null) && (
        <AdminOverlay onClose={cancelEdit}>
          <InlineForm
            title={editingId ? 'Edit Announcement' : 'New Announcement'}
            saving={saving}
            onSave={saveAnnouncement}
            onCancel={cancelEdit}
          >
            {error && <div className="admin-error">{error}</div>}
            <AnnouncementFormFields form={form} setForm={setForm} />
          </InlineForm>
        </AdminOverlay>
      )}

      {loading ? (
        <div className="loading">Loading news...</div>
      ) : (
        <div className="news-list">
          {announcements.map(item => (
            <article key={item.id} className={`news-card news-card--${item.type} ${!item.is_active ? 'news-card--inactive' : ''}`}>
              <div className="news-card__icon">{getIcon(item.type)}</div>
              <div className="news-card__content">
                <div className="news-card__header">
                  <h3 className="news-card__title">
                    {item.title}
                    {isAdmin && !item.is_active && (
                      <span className="admin-badge admin-badge--inactive" style={{ marginLeft: '0.5rem' }}>Inactive</span>
                    )}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="news-card__type">{item.type}</span>
                    {isAdmin && (
                      <div className="admin-card-controls admin-card-controls--inline">
                        <button className="admin-card-btn" onClick={() => toggleActive(item)} title={item.is_active ? 'Deactivate' : 'Activate'}>
                          {item.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button className="admin-card-btn" onClick={() => startEdit(item)} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button className="admin-card-btn admin-card-btn--danger" onClick={() => deleteAnnouncement(item.id)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
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
          {announcements.length === 0 && isAdmin && (
            <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
              <p>No announcements yet. Click "Add Announcement" to create the first one.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
