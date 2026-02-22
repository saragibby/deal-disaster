import { useEffect, useState } from 'react';
import { Wrench, ExternalLink, Lock, Calculator, CheckSquare, FileSpreadsheet, Layout } from 'lucide-react';
import { useAuth, api } from '@deal-platform/shared-auth';
import type { Tool } from '@deal-platform/shared-types';

const TYPE_ICONS: Record<string, typeof Calculator> = {
  calculator: Calculator,
  checklist: CheckSquare,
  template: Layout,
  spreadsheet: FileSpreadsheet,
  external: ExternalLink,
};

export default function Tools() {
  const { isAuthenticated } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTools()
      .then((data: { tools: Tool[] }) => setTools(data.tools))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading tools...</div>;

  return (
    <div className="tools-page">
      <h1 className="page-title">Investing Tools</h1>
      <p className="page-subtitle">
        Calculators, checklists, and templates to help you analyze deals and make smarter investing decisions.
      </p>

      <div className="tools-grid">
        {tools.map(tool => {
          const Icon = TYPE_ICONS[tool.type] || Wrench;
          const isLocked = !tool.content && tool.is_premium;

          return (
            <div key={tool.id} className={`tool-card ${isLocked ? 'tool-card--locked' : ''}`}>
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
                  <a href={tool.url} target="_blank" rel="noopener noreferrer" className="tool-card__link">
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
