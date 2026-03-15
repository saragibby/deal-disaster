import { useState, useEffect, useCallback } from 'react';
import { api } from '@deal-platform/shared-auth';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { Trash2, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';

interface Props {
  onView: (analysis: PropertyAnalysis) => void;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export default function AnalysisHistory({ onView }: Props) {
  const [analyses, setAnalyses] = useState<PropertyAnalysis[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 10;
  const totalPages = Math.ceil(total / limit);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAnalysisHistory(page, limit);
      setAnalyses(data.analyses);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = async (slug: string) => {
    if (!confirm('Delete this analysis?')) return;
    try {
      await api.deleteAnalysis(slug);
      fetchHistory();
    } catch (err: any) {
      alert(err.message || 'Failed to delete.');
    }
  };

  if (loading) {
    return (
      <div className="history__loading">
        <div className="analyzer-spinner" />
        <p>Loading history...</p>
      </div>
    );
  }

  if (error) {
    return <div className="analyzer__error">⚠️ {error}</div>;
  }

  if (analyses.length === 0) {
    return (
      <div className="history__empty">
        <Building2 size={48} strokeWidth={1.5} />
        <h3>No analyses yet</h3>
        <p>Properties you analyze will appear here for easy reference.</p>
      </div>
    );
  }

  return (
    <div className="history">
      <div className="history__list">
        {analyses.map(a => {
          const prop = a.property_data;
          const results = a.analysis_results;
          const cashFlow = results?.cashFlow;
          const positive = cashFlow?.monthlyCashFlow >= 0;

          return (
            <div key={a.slug} className="history__item" onClick={() => onView(a)} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
              <div className="history__item-main">
                <div className="history__item-address">
                  <strong>{prop.address || 'Unknown Address'}</strong>
                  <span className="history__item-location">
                    {[prop.city, prop.state, prop.zip].filter(Boolean).join(', ')}
                  </span>
                </div>
                <div className="history__item-metrics">
                  <span className="history__metric">
                    {fmt(prop.price)}
                  </span>
                  <span className={`history__metric ${positive ? 'history__metric--positive' : 'history__metric--negative'}`}>
                    {fmt(cashFlow?.monthlyCashFlow || 0)}/mo
                  </span>
                  <span className="history__metric">
                    {(results?.roi?.cashOnCashROI || 0).toFixed(1)}% CoC
                  </span>
                </div>
              </div>
              <div className="history__item-meta">
                <span className="history__date">
                  {new Date(a.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </span>
                <div className="history__actions">
                  <button
                    className="history__action-btn history__action-btn--danger"
                    onClick={(e) => { e.stopPropagation(); handleDelete(a.slug); }}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="history__pagination">
          <button
            className="history__page-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="history__page-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="history__page-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
