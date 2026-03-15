import { useState, useCallback } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { api } from '@deal-platform/shared-auth';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';

interface Props {
  properties: PropertyAnalysis[];
}

interface NarrativeMap {
  [propertySlug: string]: string;
}

export default function AIPropertyNarratives({ properties }: Props) {
  const [narratives, setNarratives] = useState<NarrativeMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hasNarratives = Object.keys(narratives).length > 0;

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const slugs = properties.map(p => p.slug);
      const result = await api.getPropertyNarratives(slugs);
      const map: NarrativeMap = {};
      result.narratives.forEach(n => { map[n.propertyId] = n.narrative; });
      setNarratives(map);
      // Auto-expand all
      const exp: Record<string, boolean> = {};
      properties.forEach(p => { exp[p.slug] = true; });
      setExpanded(exp);
    } catch (err: any) {
      setError(err.message || 'Failed to generate narratives');
    } finally {
      setLoading(false);
    }
  }, [properties]);

  const toggle = (slug: string) => {
    setExpanded(prev => ({ ...prev, [slug]: !prev[slug] }));
  };

  if (!hasNarratives && !loading && !error) {
    return (
      <div className="results__card comparison-dashboard__ai-narratives">
        <div className="comparison-dashboard__ai-narratives-header">
          <h3><Sparkles size={18} /> AI Investment Narratives</h3>
        </div>
        <div className="comparison-dashboard__ai-summary-empty">
          <p>Get per-property AI assessments covering cash flow, ROI, STR potential, and risks.</p>
          <button className="btn btn--primary" onClick={generate} disabled={loading}>
            <Sparkles size={14} /> Generate Narratives
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="results__card comparison-dashboard__ai-narratives">
      <div className="comparison-dashboard__ai-narratives-header">
        <h3><Sparkles size={18} /> AI Investment Narratives</h3>
      </div>

      {loading && (
        <div className="comparison-dashboard__ai-summary-loading">
          <span className="analyzer-spinner analyzer-spinner--sm" />
          Generating narratives for {properties.length} properties...
        </div>
      )}

      {error && (
        <div className="comparison-dashboard__ai-summary-error">
          <p>{error}</p>
          <button className="btn btn--outline" onClick={generate}>Try Again</button>
        </div>
      )}

      {hasNarratives && !loading && (
        <div className="comparison-dashboard__ai-narratives-list">
          {properties.map((p, i) => {
            const narrative = narratives[p.slug];
            if (!narrative) return null;
            const isOpen = expanded[p.slug];
            return (
              <div key={p.slug} className="comparison-dashboard__ai-narrative-item">
                <button
                  className="comparison-dashboard__ai-narrative-toggle"
                  onClick={() => toggle(p.slug)}
                >
                  <span
                    className="comparison-dashboard__table-dot"
                    style={{ background: PROPERTY_COLORS[i] }}
                  />
                  <strong>{shortAddr(p.property_data.address)}</strong>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {isOpen && (
                  <p className="comparison-dashboard__ai-narrative-text">{narrative}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
