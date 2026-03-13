import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api, useAuth } from '@deal-platform/shared-auth';
import type {
  PropertyAnalysis,
  AnalysisParams,
} from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';
import { Search, GitCompareArrows } from 'lucide-react';
import type { AskWillProps } from '@deal-platform/shared-ui';
import AnalysisResults from './AnalysisResults.js';
import AnalysisHistory from './AnalysisHistory.js';
import PropertyComparison from './PropertyComparison.js';

interface PropertyAnalyzerProps {
  onAnalysisComplete?: (context: AskWillProps['propertyAnalysis']) => void;
}

export default function PropertyAnalyzer({ onAnalysisComplete }: PropertyAnalyzerProps = {}) {
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;
  const { id: analysisId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'analyze' | 'history' | 'compare'>(
    location.pathname.endsWith('/compare') && isAdmin ? 'compare' : 'analyze'
  );
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Analysis params — use defaults (adjustable in Loan Calculator after results)
  const [params] = useState<AnalysisParams>({ ...DEFAULT_ANALYSIS_PARAMS });

  // Notify parent when analysis result changes (for Ask Will context)
  useEffect(() => {
    if (!result || !onAnalysisComplete) return;
    const p = result.property_data;
    const r = result.analysis_results;
    onAnalysisComplete({
      address: p.address,
      price: p.price,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      sqft: p.sqft,
      yearBuilt: p.yearBuilt,
      propertyType: p.propertyType,
      zestimate: p.zestimate,
      rentEstimate: r.rentalEstimate?.mid,
      monthlyCashFlow: r.cashFlow?.monthlyCashFlow,
      cashOnCashROI: r.roi?.cashOnCashROI,
      capRate: r.roi?.capRate,
      monthlyMortgage: r.mortgage?.monthlyPayment,
      taxSavings: r.taxSavings?.taxSavings,
      strNetMonthly: r.strEstimate?.netMonthlyRevenue,
    });
  }, [result, onAnalysisComplete]);

  // Auto-load analysis from URL param
  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveTab('analyze');

    api.getAnalysis(Number(analysisId))
      .then((resp: any) => {
        if (!cancelled) {
          setResult(resp.analysis || resp);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load analysis.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [analysisId]);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) {
      setError('Please enter a Zillow URL.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.runAndSaveAnalysis(url.trim(), params);
      setResult(response);
      setHistoryRefreshKey(k => k + 1);
      // Navigate to the analysis URL so it's shareable
      if (response.id) {
        navigate(`/analysis/${response.id}`, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }, [url, params]);

  const handleViewHistoryItem = useCallback((analysis: PropertyAnalysis) => {
    navigate(`/analysis/${analysis.id}`);
  }, [navigate]);

  return (
    <div className="analyzer">
      {/* Page Header */}
      <div className="analyzer__header">
        <h1 className="page-title">⚡ Property Analyzer</h1>
        <p className="page-subtitle">
          Paste a Zillow link and get comprehensive investment analysis in seconds
        </p>
      </div>

      {/* Tabs */}
      <div className="analyzer__tabs">
        <button
          className={`analyzer__tab ${activeTab === 'analyze' ? 'analyzer__tab--active' : ''}`}
          onClick={() => setActiveTab('analyze')}
        >
          <Search size={16} />
          Analyze
        </button>
        <button
          className={`analyzer__tab ${activeTab === 'history' ? 'analyzer__tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📋 History
        </button>
        {isAdmin && (
          <button
            className={`analyzer__tab ${activeTab === 'compare' ? 'analyzer__tab--active' : ''}`}
            onClick={() => { setActiveTab('compare'); navigate('/compare', { replace: true }); }}
          >
            <GitCompareArrows size={16} />
            Compare
          </button>
        )}
      </div>

      {activeTab === 'analyze' && (
        <>
          {/* URL Input Section */}
          <div className="analyzer__input-card">
            <div className="analyzer__input-row">
              <input
                type="text"
                className="analyzer__url-input"
                placeholder="https://www.zillow.com/homedetails/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                disabled={loading}
              />
              <button
                className="btn btn--primary analyzer__submit-btn"
                onClick={handleAnalyze}
                disabled={loading || !url.trim()}
              >
                {loading ? (
                  <span className="analyzer-spinner analyzer-spinner--sm" />
                ) : (
                  <>
                    <Search size={18} />
                    Analyze
                  </>
                )}
              </button>
            </div>

          </div>

          {/* Error */}
          {error && (
            <div className="analyzer__error">
              ⚠️ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="analyzer__loading">
              <div className="analyzer-spinner" />
              <p>Analyzing property and finding rental comps...</p>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <AnalysisResults analysis={result} />
          )}
        </>
      )}

      {activeTab === 'history' && (
        <AnalysisHistory
          key={historyRefreshKey}
          onView={handleViewHistoryItem}
        />
      )}

      {activeTab === 'compare' && (
        <PropertyComparison onNewAnalysis={() => setHistoryRefreshKey(k => k + 1)} />
      )}
    </div>
  );
}


