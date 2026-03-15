import { useState, useCallback, useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { api } from '@deal-platform/shared-auth';
import { Sparkles, RefreshCw } from 'lucide-react';

interface Props {
  properties: PropertyAnalysis[];
}

export default function AIDealSummary({ properties }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const slugs = properties.map(p => p.slug);
      const result = await api.getComparisonSummary(slugs);
      setSummary(result.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to generate AI summary');
    } finally {
      setLoading(false);
    }
  }, [properties]);

  // Parse the plain-text summary into individual insight lines
  const insights = useMemo(() => {
    if (!summary) return [];
    // Split on newlines first, then on sentence boundaries:
    // period/exclamation/question followed by a space and an uppercase letter.
    // Avoids splitting on decimals like "4.08%" or abbreviations.
    return summary
      .split(/\n+/)
      .flatMap(para =>
        para.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 0)
      )
      .map(s => s.trim());
  }, [summary]);

  return (
    <div className="results__card comparison-dashboard__ai-summary">
      <div className="comparison-dashboard__ai-summary-header">
        <h3><Sparkles size={18} /> AI Deal Summary</h3>
        {summary && (
          <button
            className="btn btn--ghost"
            onClick={generate}
            disabled={loading}
            title="Regenerate"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        )}
      </div>

      {!summary && !loading && !error && (
        <div className="comparison-dashboard__ai-summary-empty">
          <p>Get an AI-powered comparison of these properties — which is the strongest investment, key tradeoffs, and risks to watch.</p>
          <button className="btn btn--primary" onClick={generate} disabled={loading}>
            <Sparkles size={14} /> Generate AI Summary
          </button>
        </div>
      )}

      {loading && (
        <div className="comparison-dashboard__ai-summary-loading">
          <span className="analyzer-spinner analyzer-spinner--sm" />
          Analyzing {properties.length} properties...
        </div>
      )}

      {error && (
        <div className="comparison-dashboard__ai-summary-error">
          <p>{error}</p>
          <button className="btn btn--outline" onClick={generate}>Try Again</button>
        </div>
      )}

      {insights.length > 0 && !loading && (
        <div className="comparison-dashboard__ai-summary-text">
          {insights.map((line, i) => (
            <div key={i} className="comparison-dashboard__ai-insight">
              <span className="comparison-dashboard__ai-insight-num">{i + 1}</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
