import { Save, X } from 'lucide-react';

// ==================== Form Data Types ====================

export interface ResourceFormData {
  title: string;
  description: string;
  content: string;
  type: string;
  url: string;
  category: string;
  is_premium: boolean;
  is_featured: boolean;
  sort_order: number;
}

export interface ToolFormData {
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

export interface AnnouncementFormData {
  title: string;
  content: string;
  type: string;
  is_active: boolean;
}

export const EMPTY_RESOURCE: ResourceFormData = {
  title: '', description: '', content: '', type: 'article',
  url: '', category: 'Getting Started', is_premium: false, is_featured: false, sort_order: 0,
};

export const EMPTY_TOOL: ToolFormData = {
  name: '', description: '', content: '', type: 'calculator',
  url: '', category: 'Analysis', icon: '🔧', is_premium: false, sort_order: 0,
};

export const EMPTY_ANNOUNCEMENT: AnnouncementFormData = {
  title: '', content: '', type: 'news', is_active: true,
};

// ==================== Form Field Components ====================

export function ResourceFormFields({ form, setForm }: { form: ResourceFormData; setForm: (f: ResourceFormData) => void }) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label className="admin-form__checkbox">
            <input type="checkbox" checked={form.is_premium} onChange={e => setForm({ ...form, is_premium: e.target.checked })} />
            Premium (requires sign-in)
          </label>
          <label className="admin-form__checkbox">
            <input type="checkbox" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })} />
            Featured
          </label>
        </div>
      </div>
    </div>
  );
}

export function ToolFormFields({ form, setForm }: { form: ToolFormData; setForm: (f: ToolFormData) => void }) {
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

export function AnnouncementFormFields({ form, setForm }: { form: AnnouncementFormData; setForm: (f: AnnouncementFormData) => void }) {
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

// ==================== Inline Form Wrapper ====================

interface InlineFormProps {
  title: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

export function InlineForm({ title, saving, onSave, onCancel, children }: InlineFormProps) {
  return (
    <div className="admin-inline-form" onClick={e => e.stopPropagation()}>
      <div className="admin-inline-form__header">
        <h3>{title}</h3>
        <button className="btn btn--ghost btn--icon" onClick={onCancel} title="Cancel">
          <X size={16} />
        </button>
      </div>
      {children}
      <div className="admin-form__actions">
        <button className="btn btn--primary btn--sm" onClick={onSave} disabled={saving}>
          <Save size={14} /> {saving ? 'Saving...' : 'Save'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ==================== Overlay Backdrop ====================

export function AdminOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-overlay__content" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
