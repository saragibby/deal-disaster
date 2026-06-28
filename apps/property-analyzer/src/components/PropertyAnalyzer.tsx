import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@deal-platform/shared-auth';
import type {
  PropertyAnalysis,
  AnalysisParams,
} from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';
import { Search } from 'lucide-react';
import type { AskWillProps } from '@deal-platform/shared-ui';
import AnalysisResults from './AnalysisResults.js';
import AnalysisSkeleton from './AnalysisSkeleton.js';
import AnalysisHistory from './AnalysisHistory.js';
import PropertyComparison from './PropertyComparison.js';

type AnalyzerTab = 'analyze' | 'history' | 'compare';

interface PropertyAnalyzerProps {
  onAnalysisComplete?: (context: AskWillProps['propertyAnalysis']) => void;
  activeTab: AnalyzerTab;
  onTabChange: (tab: AnalyzerTab) => void;
}

export default function PropertyAnalyzer({ onAnalysisComplete, activeTab, onTabChange }: PropertyAnalyzerProps) {
  const { id: analysisSlug } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyAnalysis | null>(null);
  const [wasLoading, setWasLoading] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [inputExpanded, setInputExpanded] = useState(false);

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
    if (!analysisSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    onTabChange('analyze');

    api.getAnalysis(analysisSlug)
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
  }, [analysisSlug]);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) {
      setError('Please enter a property address or URL.');
      return;
    }

    setLoading(true);
    setWasLoading(true);
    setError(null);
    setResult(null);

    try {
      // Omit the server-derived params (tax, insurance, age/type-based reserves
      // and cost-seg) so the server computes property-aware values; the user can
      // still override any of them afterwards via the assumption sliders.
      const { annualPropertyTax, annualInsurance, repairsPct, capexPct, costSegPct, ...autoParams } = params;
      void annualPropertyTax; void annualInsurance; void repairsPct; void capexPct; void costSegPct;
      const response = await api.runAndSaveAnalysis(url.trim(), autoParams);
      setResult(response);
      setHistoryRefreshKey(k => k + 1);
      setInputExpanded(false);
      // Navigate to the analysis URL so it's shareable
      if (response.slug) {
        navigate(`/analysis/${response.slug}`, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }, [url, params]);

  const handleResultUpdate = useCallback((updated: PropertyAnalysis) => {
    setResult(updated);
    setHistoryRefreshKey(k => k + 1);
  }, []);

  const handleViewHistoryItem = useCallback((analysis: PropertyAnalysis) => {
    navigate(`/analysis/${analysis.slug}`);
  }, [navigate]);

  return (
    <div className="analyzer">
      {/* Page Header */}
      {!(result && activeTab === 'analyze') && (
        <div className="analyzer__header">
          <h1 className="page-title">⚡ Property Analyzer</h1>
          <p className="page-subtitle">
            Paste a Zillow link and get comprehensive investment analysis in seconds
          </p>
        </div>
      )}

      {activeTab === 'analyze' && (
        <>
          {/* URL Input — hidden once a property is analyzed (re-shown via "Analyze another") */}
          {(!result || inputExpanded) && (
            <div className="analyzer__input-card">
              <div className="analyzer__input-row">
                <input
                  type="text"
                  className="analyzer__url-input"
                  placeholder="Enter an address or paste a link from Zillow, Redfin, Realtor.com, or Trulia"
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
              {result && !loading && (
                <button
                  type="button"
                  className="analyzer__advanced-toggle"
                  onClick={() => setInputExpanded(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="analyzer__error">
              ⚠️ {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && <AnalysisSkeleton />}

          {/* Results */}
          {result && !loading && (
            <AnalysisResults
              analysis={result}
              skipEntrance={wasLoading}
              onUpdate={handleResultUpdate}
              onAnalyzeAnother={() => { setInputExpanded(true); setUrl(''); }}
            />
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


