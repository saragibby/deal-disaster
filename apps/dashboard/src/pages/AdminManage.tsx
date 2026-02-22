import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Save, X, BookOpen, Wrench, Megaphone, Eye, EyeOff } from 'lucide-react';
import { useAuth, api } from '@deal-platform/shared-auth';
import type { Resource, Tool, Announcement } from '@deal-platform/shared-types';

type Tab = 'resources' | 'tools' | 'announcements';

interface ResourceFormData {
  title: string;
  description: string;
  content: string;
  type: string;
  url: string;
  category: string;
  is_premium: boolean;
  sort_order: number;
}

interface ToolFormData {
  name: string;
  description: string;
  content: string;
  type: string;
  url: string;
  category: string;
  icon: string;
  is_premium: boolean;
  sort_order: number;
}

interface AnnouncementFormData {
  title: string;
  content: string;
  type: string;
  is_active: boolean;
}

const EMPTY_RESOURCE: ResourceFormData = {
  title: '', description: '', content: '', type: 'article',
  url: '', category: 'Getting Started', is_premium: false, sort_order: 0,
};

const EMPTY_TOOL: ToolFormData = {
  name: '', description: '', content: '', type: 'calculator',
  url: '', category: 'Analysis', icon: '🔧', is_premium: false, sort_order: 0,
};

const EMPTY_ANNOUNCEMENT: AnnouncementFormData = {
  title: '', content: '', type: 'news', is_active: true,
};

export default function AdminManage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('resources');
  const [resources, setResources] = useState<Resource[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null);
  const [editingToolId, setEditingToolId] = useState<number | null>(null);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [resourceForm, setResourceForm] = useState<ResourceFormData>(EMPTY_RESOURCE);
  const [toolForm, setToolForm] = useState<ToolFormData>(EMPTY_TOOL);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormData>(EMPTY_ANNOUNCEMENT);
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [resData, toolData, annData] = await Promise.all([
        api.getResources(),
        api.getTools(),
        api.getAdminAnnouncements(),
      ]);
      setResources(resData.resources);
      setTools(toolData.tools);
      setAnnouncements(annData.announcements);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  if (!user?.is_admin) {
    return (
      <div className="empty-state">
        <h3>Access Denied</h3>
        <p>You need admin privileges to access this page.</p>
      </div>
    );
  }

  // ==================== Resource handlers ====================

  function startEditResource(r: Resource) {
    setEditingResourceId(r.id);
    setShowNewForm(false);
    setResourceForm({
      title: r.title,
      description: r.description,
      content: r.content || '',
      type: r.type,
      url: r.url || '',
      category: r.category,
      is_premium: r.is_premium,
      sort_order: r.sort_order,
    });
  }

  function startNewResource() {
    setEditingResourceId(null);
    setShowNewForm(true);
    setResourceForm(EMPTY_RESOURCE);
  }

  async function saveResource() {
    setSaving(true);
    setError('');
    try {
      if (editingResourceId) {
        await api.updateResource(editingResourceId, resourceForm);
      } else {
        await api.createResource(resourceForm);
      }
      setShowNewForm(false);
      setEditingResourceId(null);
      await loadData();
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
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  }

  // ==================== Tool handlers ====================

  function startEditTool(t: Tool) {
    setEditingToolId(t.id);
    setShowNewForm(false);
    setToolForm({
      name: t.name,
      description: t.description,
      content: t.content || '',
      type: t.type,
      url: t.url || '',
      category: t.category,
      icon: t.icon,
      is_premium: t.is_premium,
      sort_order: t.sort_order,
    });
  }

  function startNewTool() {
    setEditingToolId(null);
    setShowNewForm(true);
    setToolForm(EMPTY_TOOL);
  }

  async function saveTool() {
    setSaving(true);
    setError('');
    try {
      if (editingToolId) {
        await api.updateTool(editingToolId, toolForm);
      } else {
        await api.createTool(toolForm);
      }
      setShowNewForm(false);
      setEditingToolId(null);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTool(id: number) {
    if (!confirm('Delete this tool?')) return;
    try {
      await api.deleteTool(id);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  }

  // ==================== Announcement handlers ====================

  function startEditAnnouncement(a: Announcement) {
    setEditingAnnouncementId(a.id);
    setShowNewForm(false);
    setAnnouncementForm({
      title: a.title,
      content: a.content,
      type: a.type,
      is_active: a.is_active,
    });
  }

  function startNewAnnouncement() {
    setEditingAnnouncementId(null);
    setShowNewForm(true);
    setAnnouncementForm(EMPTY_ANNOUNCEMENT);
  }

  async function saveAnnouncement() {
    setSaving(true);
    setError('');
    try {
      if (editingAnnouncementId) {
        await api.updateAnnouncement(editingAnnouncementId, announcementForm);
      } else {
        await api.createAnnouncement(announcementForm);
      }
      setShowNewForm(false);
      setEditingAnnouncementId(null);
      await loadData();
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
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  }

  async function toggleAnnouncementActive(a: Announcement) {
    try {
      await api.updateAnnouncement(a.id, { is_active: !a.is_active });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  }

  function cancelEdit() {
    setEditingResourceId(null);
    setEditingToolId(null);
    setEditingAnnouncementId(null);
    setShowNewForm(false);
    setError('');
  }

  if (loading) return <div className="loading">Loading admin data...</div>;

  return (
    <div className="admin-manage">
      <h1 className="page-title">Manage Content</h1>
      <p className="page-subtitle">Add, edit, and remove resources and tools for the platform.</p>

      {error && <div className="admin-error">{error}</div>}

      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === 'resources' ? 'admin-tab--active' : ''}`}
          onClick={() => { setTab('resources'); cancelEdit(); }}
        >
          <BookOpen size={16} /> Resources ({resources.length})
        </button>
        <button
          className={`admin-tab ${tab === 'tools' ? 'admin-tab--active' : ''}`}
          onClick={() => { setTab('tools'); cancelEdit(); }}
        >
          <Wrench size={16} /> Tools ({tools.length})
        </button>
        <button
          className={`admin-tab ${tab === 'announcements' ? 'admin-tab--active' : ''}`}
          onClick={() => { setTab('announcements'); cancelEdit(); }}
        >
          <Megaphone size={16} /> Announcements ({announcements.length})
        </button>
      </div>

      {/* ==================== Resources Tab ==================== */}
      {tab === 'resources' && (
        <div className="admin-section">
          <div className="admin-section__header">
            <h2>Resources</h2>
            <button className="btn btn--primary btn--sm" onClick={startNewResource}>
              <Plus size={16} /> Add Resource
            </button>
          </div>

          {showNewForm && !editingResourceId && (
            <div className="admin-form">
              <h3>New Resource</h3>
              <ResourceFormFields form={resourceForm} setForm={setResourceForm} />
              <div className="admin-form__actions">
                <button className="btn btn--primary btn--sm" onClick={saveResource} disabled={saving}>
                  <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          )}

          <div className="admin-list">
            {resources.map(r => (
              <div key={r.id} className="admin-list__item">
                {editingResourceId === r.id ? (
                  <div className="admin-form">
                    <h3>Edit Resource</h3>
                    <ResourceFormFields form={resourceForm} setForm={setResourceForm} />
                    <div className="admin-form__actions">
                      <button className="btn btn--primary btn--sm" onClick={saveResource} disabled={saving}>
                        <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-list__row">
                    <div className="admin-list__info">
                      <span className="admin-list__title">{r.title}</span>
                      <span className="admin-list__meta">
                        {r.type} · {r.category}
                        {r.is_premium && <span className="admin-badge admin-badge--premium">Premium</span>}
                      </span>
                    </div>
                    <div className="admin-list__actions">
                      <button className="btn btn--ghost btn--icon" onClick={() => startEditResource(r)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn--danger btn--icon" onClick={() => deleteResource(r.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== Tools Tab ==================== */}
      {tab === 'tools' && (
        <div className="admin-section">
          <div className="admin-section__header">
            <h2>Tools</h2>
            <button className="btn btn--primary btn--sm" onClick={startNewTool}>
              <Plus size={16} /> Add Tool
            </button>
          </div>

          {showNewForm && !editingToolId && (
            <div className="admin-form">
              <h3>New Tool</h3>
              <ToolFormFields form={toolForm} setForm={setToolForm} />
              <div className="admin-form__actions">
                <button className="btn btn--primary btn--sm" onClick={saveTool} disabled={saving}>
                  <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          )}

          <div className="admin-list">
            {tools.map(t => (
              <div key={t.id} className="admin-list__item">
                {editingToolId === t.id ? (
                  <div className="admin-form">
                    <h3>Edit Tool</h3>
                    <ToolFormFields form={toolForm} setForm={setToolForm} />
                    <div className="admin-form__actions">
                      <button className="btn btn--primary btn--sm" onClick={saveTool} disabled={saving}>
                        <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-list__row">
                    <div className="admin-list__info">
                      <span className="admin-list__title">{t.icon} {t.name}</span>
                      <span className="admin-list__meta">
                        {t.type} · {t.category}
                        {t.is_premium && <span className="admin-badge admin-badge--premium">Premium</span>}
                      </span>
                    </div>
                    <div className="admin-list__actions">
                      <button className="btn btn--ghost btn--icon" onClick={() => startEditTool(t)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn--danger btn--icon" onClick={() => deleteTool(t.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== Announcements Tab ==================== */}
      {tab === 'announcements' && (
        <div className="admin-section">
          <div className="admin-section__header">
            <h2>Announcements</h2>
            <button className="btn btn--primary btn--sm" onClick={startNewAnnouncement}>
              <Plus size={16} /> Add Announcement
            </button>
          </div>

          {showNewForm && !editingAnnouncementId && (
            <div className="admin-form">
              <h3>New Announcement</h3>
              <AnnouncementFormFields form={announcementForm} setForm={setAnnouncementForm} />
              <div className="admin-form__actions">
                <button className="btn btn--primary btn--sm" onClick={saveAnnouncement} disabled={saving}>
                  <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          )}

          <div className="admin-list">
            {announcements.map(a => (
              <div key={a.id} className="admin-list__item">
                {editingAnnouncementId === a.id ? (
                  <div className="admin-form">
                    <h3>Edit Announcement</h3>
                    <AnnouncementFormFields form={announcementForm} setForm={setAnnouncementForm} />
                    <div className="admin-form__actions">
                      <button className="btn btn--primary btn--sm" onClick={saveAnnouncement} disabled={saving}>
                        <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-list__row">
                    <div className="admin-list__info">
                      <span className="admin-list__title">
                        {a.title}
                        {!a.is_active && <span className="admin-badge admin-badge--inactive">Inactive</span>}
                      </span>
                      <span className="admin-list__meta">
                        {a.type} · {new Date(a.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="admin-list__actions">
                      <button
                        className="btn btn--ghost btn--icon"
                        onClick={() => toggleAnnouncementActive(a)}
                        title={a.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {a.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button className="btn btn--ghost btn--icon" onClick={() => startEditAnnouncement(a)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn--danger btn--icon" onClick={() => deleteAnnouncement(a.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {announcements.length === 0 && (
              <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                <p>No announcements yet. Create one to display on the home page.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Form Field Components ====================

function ResourceFormFields({ form, setForm }: { form: ResourceFormData; setForm: (f: ResourceFormData) => void }) {
  return (
    <div className="admin-form__fields">
      <label>
        Title *
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        Description *
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
      </label>
      <label>
        Content (full article / markdown)
        <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} />
      </label>
      <div className="admin-form__row">
        <label>
          Type
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="article">Article</option>
            <option value="guide">Guide</option>
            <option value="video">Video</option>
            <option value="external">External</option>
          </select>
        </label>
        <label>
          Category
          <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        </label>
      </div>
      <label>
        URL (optional)
        <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
      </label>
      <div className="admin-form__row">
        <label>
          Sort Order
          <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </label>
        <label className="admin-form__checkbox">
          <input type="checkbox" checked={form.is_premium} onChange={e => setForm({ ...form, is_premium: e.target.checked })} />
          Premium (requires sign-in)
        </label>
      </div>
    </div>
  );
}

function ToolFormFields({ form, setForm }: { form: ToolFormData; setForm: (f: ToolFormData) => void }) {
  return (
    <div className="admin-form__fields">
      <div className="admin-form__row">
        <label>
          Name *
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Icon (emoji)
          <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} style={{ width: '4rem' }} />
        </label>
      </div>
      <label>
        Description *
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
      </label>
      <label>
        Content (instructions / embed code / markdown)
        <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} />
      </label>
      <div className="admin-form__row">
        <label>
          Type
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="calculator">Calculator</option>
            <option value="checklist">Checklist</option>
            <option value="template">Template</option>
            <option value="spreadsheet">Spreadsheet</option>
            <option value="external">External</option>
          </select>
        </label>
        <label>
          Category
          <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        </label>
      </div>
      <label>
        URL (optional)
        <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
      </label>
      <div className="admin-form__row">
        <label>
          Sort Order
          <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </label>
        <label className="admin-form__checkbox">
          <input type="checkbox" checked={form.is_premium} onChange={e => setForm({ ...form, is_premium: e.target.checked })} />
          Premium (requires sign-in)
        </label>
      </div>
    </div>
  );
}

function AnnouncementFormFields({ form, setForm }: { form: AnnouncementFormData; setForm: (f: AnnouncementFormData) => void }) {
  return (
    <div className="admin-form__fields">
      <label>
        Title *
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        Content *
        <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={3} />
      </label>
      <div className="admin-form__row">
        <label>
          Type
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="news">News</option>
            <option value="update">Update</option>
            <option value="tip">Tip</option>
          </select>
        </label>
        <label className="admin-form__checkbox">
          <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
          Active (visible on home page)
        </label>
      </div>
    </div>
  );
}
