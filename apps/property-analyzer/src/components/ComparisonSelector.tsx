import { useState, useEffect, useCallback } from 'react';
import { analyzerApi } from '@deal-platform/shared-auth';
import type { PropertyAnalysis, SavedComparison } from '@deal-platform/shared-types';
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, Plus, GitCompareArrows, Building2, FolderOpen, Trash2, PlusCircle } from 'lucide-react';

const MAX_PROPERTIES = 6;

interface Props {
  onCompare: (properties: PropertyAnalysis[]) => void;
  onNewAnalysis?: () => void;
  onLoadComparison?: (slugs: string[]) => void;
  savedRefreshKey?: number;
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

export default function ComparisonSelector({ onCompare, onNewAnalysis, onLoadComparison, savedRefreshKey }: Props) {
  const [selected, setSelected] = useState<PropertyAnalysis[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());

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

  // Saved comparisons
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [addToMenuSlug, setAddToMenuSlug] = useState<string | null>(null);

  const fetchSavedComparisons = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const data = await analyzerApi.getSavedComparisons({ page: 1, limit: 50 });
      setSavedComparisons(data.items);
    } catch (err: any) {
      setSavedError(err.message || 'Failed to load saved comparisons.');
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedComparisons();
  }, [fetchSavedComparisons, savedRefreshKey]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await analyzerApi.getHistory({ page: historyPage, limit: historyLimit });
      setHistory(data.items);
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
    if (selectedSlugs.has(analysis.slug)) return;
    if (selected.length >= MAX_PROPERTIES) return;

    setSelected(prev => [...prev, analysis]);
    setSelectedSlugs(prev => new Set(prev).add(analysis.slug));
  }, [selected.length, selectedSlugs]);

  const removeProperty = useCallback((slug: string) => {
    setSelected(prev => prev.filter(p => p.slug !== slug));
    setSelectedSlugs(prev => {
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
  }, []);

  const handleAddUrl = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError('Please enter a property address or URL.');
      return;
    }

    if (selected.length >= MAX_PROPERTIES) {
      setUrlError(`Maximum ${MAX_PROPERTIES} properties allowed.`);
      return;
    }

    setUrlLoading(true);
    setUrlError(null);

    try {
      const analysis = await analyzerApi.runAnalysis({ url: trimmed });
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
    if (selectedSlugs.has(analysis.slug)) {
      removeProperty(analysis.slug);
    } else {
      if (selected.length >= MAX_PROPERTIES) return;
      // History items may not have full data — fetch full analysis
      analyzerApi.getAnalysis(analysis.slug)
        .then(addProperty)
        .catch(() => {
          // Fallback: use the summary data we already have
          addProperty(analysis);
        });
    }
  }, [selectedSlugs, selected.length, addProperty, removeProperty]);
  const handleLoadSaved = useCallback((comp: SavedComparison) => {
    if (onLoadComparison) {
      onLoadComparison(comp.property_slugs);
    }
  }, [onLoadComparison]);

  const handleDeleteSaved = useCallback(async (e: React.MouseEvent, comp: SavedComparison) => {
    e.stopPropagation();
    if (!confirm(`Delete "${comp.name}"?`)) return;
    try {
      await analyzerApi.deleteSavedComparison(comp.id);
      fetchSavedComparisons();
    } catch (err: any) {
      alert(err.message || 'Failed to delete comparison.');
    }
  }, [fetchSavedComparisons]);

  const handleAddToSaved = useCallback(async (comp: SavedComparison, slug: string) => {
    if (comp.property_slugs.includes(slug)) return;
    if (comp.property_slugs.length >= MAX_PROPERTIES) {
      alert(`"${comp.name}" already has ${MAX_PROPERTIES} properties (maximum).`);
      return;
    }
    try {
      await analyzerApi.updateComparisonSlugs(comp.id, [...comp.property_slugs, slug]);
      setAddToMenuSlug(null);
      fetchSavedComparisons();
    } catch (err: any) {
      alert(err.message || 'Failed to add property to comparison.');
    }
  }, [fetchSavedComparisons]);
  return (
    <div className="comparison-selector">
      {/* Selected Properties Bar */}
      {selected.length > 0 && (
        <div className="comparison-selector__selected-bar">
          <div className="comparison-selector__chips">
            {selected.map((p, i) => (
              <div
                key={p.slug}
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
                  onClick={() => removeProperty(p.slug)}
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
          Paste a property URL or address to analyze and add it to your comparison
        </p>
        <div className="comparison-selector__url-row">
          <input
            type="text"
            className="analyzer__url-input"
            placeholder="Enter an address or paste a link"
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

      {/* Saved Comparisons Section — collapsible */}
      <div className="results__card comparison-selector__saved-section">
        <button
          className="comparison-selector__section-toggle"
          onClick={() => setSavedExpanded(prev => !prev)}
        >
          <h3 className="comparison-selector__section-title">
            <FolderOpen size={18} /> Saved Comparisons
            {!savedLoading && savedComparisons.length > 0 && (
              <span className="comparison-selector__badge">{savedComparisons.length}</span>
            )}
          </h3>
          <ChevronDown
            size={18}
            className={`comparison-selector__toggle-icon ${savedExpanded ? 'comparison-selector__toggle-icon--open' : ''}`}
          />
        </button>

        {savedExpanded && (
          <>
            <p className="comparison-selector__section-desc">
              Load a previously saved comparison report
            </p>

            {savedLoading ? (
              <div className="history__loading">
                <div className="analyzer-spinner" />
                <p>Loading saved comparisons...</p>
              </div>
            ) : savedError ? (
              <div className="analyzer__error">⚠️ {savedError}</div>
            ) : savedComparisons.length === 0 ? (
              <div className="history__empty">
                <FolderOpen size={48} strokeWidth={1.5} />
                <h3>No saved comparisons</h3>
                <p>Compare properties and click "Save" to access them here later.</p>
              </div>
            ) : (
              <div className="comparison-selector__history-list">
                {savedComparisons.map(comp => (
                  <div
                    key={comp.id}
                    className="comparison-selector__history-item comparison-selector__saved-item"
                    onClick={() => handleLoadSaved(comp)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="comparison-selector__history-info">
                      <div className="comparison-selector__history-address">
                        <strong>{comp.name}</strong>
                        <span className="comparison-selector__history-location">
                          {comp.property_slugs.length} properties
                        </span>
                      </div>
                    </div>
                    <div className="comparison-selector__saved-actions">
                      <span className="comparison-selector__history-date">
                        {new Date(comp.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </span>
                      <button
                        className="comparison-selector__delete-btn"
                        onClick={(e) => handleDeleteSaved(e, comp)}
                        title="Delete saved comparison"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
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
                const isSelected = selectedSlugs.has(a.slug);
                const atMax = selected.length >= MAX_PROPERTIES && !isSelected;

                return (
                  <div
                    key={a.slug}
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
                    <div className="comparison-selector__history-actions">
                      <div className="comparison-selector__history-date">
                        {new Date(a.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </div>
                      {savedComparisons.length > 0 && (
                        <div className="comparison-selector__add-to-wrapper">
                          <button
                            className="comparison-selector__add-to-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddToMenuSlug(addToMenuSlug === a.slug ? null : a.slug);
                            }}
                            title="Add to saved comparison"
                          >
                            <PlusCircle size={14} />
                          </button>
                          {addToMenuSlug === a.slug && (
                            <div className="comparison-selector__add-to-menu">
                              <div className="comparison-selector__add-to-menu-title">Add to comparison:</div>
                              {savedComparisons.map(comp => {
                                const alreadyIn = comp.property_slugs.includes(a.slug);
                                const full = comp.property_slugs.length >= MAX_PROPERTIES;
                                return (
                                  <button
                                    key={comp.id}
                                    className="comparison-selector__add-to-menu-item"
                                    disabled={alreadyIn || full}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddToSaved(comp, a.slug);
                                    }}
                                  >
                                    <span>{comp.name}</span>
                                    <span className="comparison-selector__add-to-meta">
                                      {alreadyIn ? 'Already added' : full ? 'Full' : `${comp.property_slugs.length}/${MAX_PROPERTIES}`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
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
