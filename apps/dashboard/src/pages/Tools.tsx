import { useEffect, useState } from 'react';
import { Wrench, ExternalLink, Lock, Calculator, CheckSquare, FileSpreadsheet, Layout, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth, api, buildAppUrl } from '@deal-platform/shared-auth';
import type { Tool } from '@deal-platform/shared-types';
import {
  ToolFormFields, InlineForm, AdminOverlay,
  EMPTY_TOOL, type ToolFormData,
} from '../components/AdminInlineForm';

const TYPE_ICONS: Record<string, typeof Calculator> = {
  calculator: Calculator,
  checklist: CheckSquare,
  template: Layout,
  spreadsheet: FileSpreadsheet,
  external: ExternalLink,
};

export default function Tools() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState<ToolFormData>(EMPTY_TOOL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function loadTools() {
    setLoading(true);
    api.getTools()
      .then((data: { tools: Tool[] }) => setTools(data.tools))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTools(); }, []);

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_TOOL);
    setShowNewForm(true);
    setError('');
  }

  function startEdit(t: Tool) {
    setShowNewForm(false);
    setEditingId(t.id);
    setForm({
      name: t.name, description: t.description, content: t.content || '',
      type: t.type, url: t.url || '', category: t.category,
      icon: t.icon, is_premium: t.is_premium, is_featured: t.is_featured, sort_order: t.sort_order,
    });
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNewForm(false);
    setError('');
  }

  async function saveTool() {
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.updateTool(editingId, form);
      } else {
        await api.createTool(form);
      }
      cancelEdit();
      loadTools();
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
      loadTools();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  }

  if (loading) return <div className="loading">Loading tools...</div>;

  return (
    <div className="tools-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Investing Tools</h1>
          <p className="page-subtitle">
            Calculators, checklists, and templates to help you analyze deals and make smarter investing decisions.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn--primary btn--sm" onClick={startNew}>
            <Plus size={16} /> Add Tool
          </button>
        )}
      </div>

      {error && <div className="admin-error">{error}</div>}

      {/* Admin overlay for new/edit forms */}
      {(showNewForm || editingId !== null) && (
        <AdminOverlay onClose={cancelEdit}>
          <InlineForm
            title={editingId ? 'Edit Tool' : 'New Tool'}
            saving={saving}
            onSave={saveTool}
            onCancel={cancelEdit}
          >
            {error && <div className="admin-error">{error}</div>}
            <ToolFormFields form={form} setForm={setForm} />
          </InlineForm>
        </AdminOverlay>
      )}

      <div className="tools-grid">
        {tools.map(tool => {
          const Icon = TYPE_ICONS[tool.type] || Wrench;
          const isLocked = !tool.content && tool.is_premium;

          return (
            <div key={tool.id} className={`tool-card ${isLocked ? 'tool-card--locked' : ''}`}>
              {isAdmin && (
                <div className="admin-card-controls">
                  <button className="admin-card-btn" onClick={(e) => { e.stopPropagation(); startEdit(tool); }} title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button className="admin-card-btn admin-card-btn--danger" onClick={(e) => { e.stopPropagation(); deleteTool(tool.id); }} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
              <div className="tool-card__header">
                <span className="tool-card__icon-badge">{tool.icon}</span>
                <div className="tool-card__meta">
                  <span className="tool-card__category">{tool.category}</span>
                  {isLocked && (
                    <span className="tool-card__lock">
                      <Lock size={14} /> Members Only
                    </span>
                  )}
                </div>
              </div>
              <div className="tool-card__body">
                <h3 className="tool-card__name">{tool.name}</h3>
                {isAuthenticated ? (
                  <p className="tool-card__description">{tool.description}</p>
                ) : (
                  <div className="content-gate">
                    <Lock size={20} />
                    <p>Sign in to see details and access this tool</p>
                    <a href="/login" className="btn btn--primary btn--sm">Create Free Account</a>
                  </div>
                )}
              </div>
              <div className="tool-card__footer">
                <div className="tool-card__type">
                  <Icon size={14} />
                  <span>{tool.type}</span>
                </div>
                {tool.url && !isLocked ? (
                  <a href={tool.url.startsWith('/') ? buildAppUrl(tool.url) : tool.url} target={tool.url.startsWith('/') ? undefined : '_blank'} rel={tool.url.startsWith('/') ? undefined : 'noopener noreferrer'} className="tool-card__link">
                    Open Tool <ExternalLink size={14} />
                  </a>
                ) : !isLocked ? (
                  <span className="tool-card__available">Available</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {tools.length === 0 && isAdmin && (
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          <p>No tools yet. Click "Add Tool" to create the first one.</p>
        </div>
      )}

      {!isAuthenticated && (
        <div className="content-gate-banner">
          <h3>Unlock All Tools</h3>
          <p>Create a free account to access premium calculators, templates, and checklists.</p>
          <a href="/login" className="btn btn--primary">Sign Up Free</a>
        </div>
      )}
    </div>
  );
}
