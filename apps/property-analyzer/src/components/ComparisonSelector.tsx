import { useState, useEffect, useCallback } from 'react';
import { api } from '@deal-platform/shared-auth';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { Search, X, ChevronLeft, ChevronRight, Plus, GitCompareArrows, Building2 } from 'lucide-react';

const MAX_PROPERTIES = 6;

interface Props {
  onCompare: (properties: PropertyAnalysis[]) => void;
  onNewAnalysis?: () => void;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function shortAddress(address: string): string {
  // Take first part before comma or first 30 chars
  const short = address.split(',')[0];
  return short.length > 35 ? short.slice(0, 32) + '...' : short;
}

export default function ComparisonSelector({ onCompare, onNewAnalysis }: Props) {
  const [selected, setSelected] = useState<PropertyAnalysis[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // URL input
  const [url, setUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // History list
  const [history, setHistory] = useState<PropertyAnalysis[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyLimit = 10;
  const totalPages = Math.ceil(historyTotal / historyLimit);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await api.getAnalysisHistory(historyPage, historyLimit);
      setHistory(data.analyses);
      setHistoryTotal(data.total);
    } catch (err: any) {
      setHistoryError(err.message || 'Failed to load history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const addProperty = useCallback((analysis: PropertyAnalysis) => {
    if (selectedIds.has(analysis.id)) return;
    if (selected.length >= MAX_PROPERTIES) return;

    setSelected(prev => [...prev, analysis]);
    setSelectedIds(prev => new Set(prev).add(analysis.id));
  }, [selected.length, selectedIds]);

  const removeProperty = useCallback((id: number) => {
    setSelected(prev => prev.filter(p => p.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleAddUrl = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError('Please enter a Zillow URL.');
      return;
    }

    if (!trimmed.includes('zillow.com')) {
      setUrlError('Please enter a valid Zillow URL.');
      return;
    }

    if (selected.length >= MAX_PROPERTIES) {
      setUrlError(`Maximum ${MAX_PROPERTIES} properties allowed.`);
      return;
    }

    setUrlLoading(true);
    setUrlError(null);

    try {
      const analysis = await api.runAndSaveAnalysis(trimmed);
      addProperty(analysis);
      setUrl('');
      onNewAnalysis?.();
      // Refresh history to show the new entry
      fetchHistory();
    } catch (err: any) {
      setUrlError(err.message || 'Analysis failed. Check the URL and try again.');
    } finally {
      setUrlLoading(false);
    }
  }, [url, selected.length, addProperty, onNewAnalysis, fetchHistory]);

  const toggleHistoryItem = useCallback((analysis: PropertyAnalysis) => {
    if (selectedIds.has(analysis.id)) {
      removeProperty(analysis.id);
    } else {
      if (selected.length >= MAX_PROPERTIES) return;
      // History items may not have full data — fetch full analysis
      api.getAnalysis(analysis.id)
        .then((resp: any) => {
          const full = resp.analysis || resp;
          addProperty(full);
        })
        .catch(() => {
          // Fallback: use the summary data we already have
          addProperty(analysis);
        });
    }
  }, [selectedIds, selected.length, addProperty, removeProperty]);

  return (
    <div className="comparison-selector">
      {/* Selected Properties Bar */}
      {selected.length > 0 && (
        <div className="comparison-selector__selected-bar">
          <div className="comparison-selector__chips">
            {selected.map((p, i) => (
              <div
                key={p.id}
                className="comparison-selector__chip"
                style={{ borderColor: PROPERTY_COLORS[i] }}
              >
                <span
                  className="comparison-selector__chip-dot"
                  style={{ background: PROPERTY_COLORS[i] }}
                />
                <span className="comparison-selector__chip-text">
                  {shortAddress(p.property_data.address)}
                </span>
                <button
                  className="comparison-selector__chip-remove"
                  onClick={() => removeProperty(p.id)}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="comparison-selector__bar-actions">
            <span className="comparison-selector__count">
              {selected.length} of {MAX_PROPERTIES} max
            </span>
            <button
              className="btn btn--primary comparison-selector__compare-btn"
              disabled={selected.length < 2}
              onClick={() => onCompare(selected)}
            >
              <GitCompareArrows size={18} />
              Compare {selected.length >= 2 ? `(${selected.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* URL Input Section */}
      <div className="results__card comparison-selector__url-section">
        <h3 className="comparison-selector__section-title">
          <Plus size={18} /> Add Property by URL
        </h3>
        <p className="comparison-selector__section-desc">
          Paste a Zillow listing URL to analyze and add it to your comparison
        </p>
        <div className="comparison-selector__url-row">
          <input
            type="text"
            className="analyzer__url-input"
            placeholder="https://www.zillow.com/homedetails/..."
            value={url}
            onChange={e => { setUrl(e.target.value); setUrlError(null); }}
            onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
            disabled={urlLoading}
          />
          <button
            className="btn btn--primary"
            onClick={handleAddUrl}
            disabled={urlLoading || !url.trim() || selected.length >= MAX_PROPERTIES}
          >
            {urlLoading ? (
              <span className="analyzer-spinner analyzer-spinner--sm" />
            ) : (
              <>
                <Search size={16} />
                Add
              </>
            )}
          </button>
        </div>
        {urlError && (
          <div className="comparison-selector__url-error">⚠️ {urlError}</div>
        )}
      </div>

      {/* History Selection Section */}
      <div className="results__card comparison-selector__history-section">
        <h3 className="comparison-selector__section-title">
          📋 Select from History
        </h3>
        <p className="comparison-selector__section-desc">
          Check properties you've previously analyzed to include in the comparison
        </p>

        {historyLoading ? (
          <div className="history__loading">
            <div className="analyzer-spinner" />
            <p>Loading history...</p>
          </div>
        ) : historyError ? (
          <div className="analyzer__error">⚠️ {historyError}</div>
        ) : history.length === 0 ? (
          <div className="history__empty">
            <Building2 size={48} strokeWidth={1.5} />
            <h3>No analyses yet</h3>
            <p>Analyze properties first, then select them here to compare.</p>
          </div>
        ) : (
          <>
            <div className="comparison-selector__history-list">
              {history.map(a => {
                const prop = a.property_data;
                const results = a.analysis_results;
                const cashFlow = results?.cashFlow;
                const isSelected = selectedIds.has(a.id);
                const atMax = selected.length >= MAX_PROPERTIES && !isSelected;

                return (
                  <div
                    key={a.id}
                    className={`comparison-selector__history-item ${
                      isSelected ? 'comparison-selector__history-item--selected' : ''
                    } ${atMax ? 'comparison-selector__history-item--disabled' : ''}`}
                    onClick={() => !atMax && toggleHistoryItem(a)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="comparison-selector__history-check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        disabled={atMax}
                        tabIndex={-1}
                      />
                    </div>
                    <div className="comparison-selector__history-info">
                      <div className="comparison-selector__history-address">
                        <strong>{prop.address || 'Unknown Address'}</strong>
                        <span className="comparison-selector__history-location">
                          {[prop.city, prop.state, prop.zip].filter(Boolean).join(', ')}
                        </span>
                      </div>
                      <div className="comparison-selector__history-metrics">
                        <span>{fmt(prop.price)}</span>
                        <span className={cashFlow?.monthlyCashFlow >= 0 ? 'text--positive' : 'text--negative'}>
                          {fmt(cashFlow?.monthlyCashFlow || 0)}/mo
                        </span>
                        <span>{(results?.roi?.cashOnCashROI || 0).toFixed(1)}% CoC</span>
                      </div>
                    </div>
                    <div className="comparison-selector__history-date">
                      {new Date(a.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="history__pagination">
                <button
                  className="history__page-btn"
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span className="history__page-info">
                  Page {historyPage} of {totalPages}
                </span>
                <button
                  className="history__page-btn"
                  onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                  disabled={historyPage >= totalPages}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Empty state CTA */}
      {selected.length === 0 && (
        <div className="comparison-selector__empty-hint">
          <GitCompareArrows size={32} strokeWidth={1.5} />
          <p>Select at least <strong>2 properties</strong> to start comparing</p>
        </div>
      )}
    </div>
  );
}

export const PROPERTY_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // rose
  '#06b6d4', // cyan
  '#8b5cf6', // violet
];
