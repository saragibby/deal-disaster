import { useState, useCallback, useEffect } from 'react';
import type {
  AnalysisUsageSummary,
  PropertyAnalysis,
  AnalysisParams,
} from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS, getAnalysisLimitUsage } from '@deal-platform/shared-types';
import { Search } from 'lucide-react';
import AnalysisResults from './AnalysisResults.js';
import AnalysisSkeleton from './AnalysisSkeleton.js';
import AnalysisHistory from './AnalysisHistory.js';
import PropertyComparison from './PropertyComparison.js';
import UsageMeter from './UsageMeter.js';
import UsageLimitDialog from './UsageLimitDialog.js';
import { usePropertyAnalyzerCore } from '../context.js';

export default function PropertyAnalyzer() {
  const { adapters, branding, route, activeTab, setAssistantContext, changeTab } = usePropertyAnalyzerCore();
  const { api, navigation, usage: usageAdapter } = adapters;
  const analysisSlug = route.kind === 'analyze' ? route.slug : undefined;
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyAnalysis | null>(null);
  const [wasLoading, setWasLoading] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [inputExpanded, setInputExpanded] = useState(false);
  const [usage, setUsage] = useState<AnalysisUsageSummary | null>(null);
  const [limitDialogUsage, setLimitDialogUsage] = useState<AnalysisUsageSummary | null>(null);

  const refreshUsage = useCallback(() => {
    if (!usageAdapter) return;
    usageAdapter.getSummary().then(setUsage).catch(() => undefined);
  }, [usageAdapter]);

  // Refresh on mount and when the user returns (e.g. after buying credits in another tab).
  useEffect(() => {
    if (!usageAdapter) return;
    refreshUsage();
    window.addEventListener('focus', refreshUsage);
    return () => window.removeEventListener('focus', refreshUsage);
  }, [refreshUsage, usageAdapter]);

  // Analysis params — use defaults (adjustable in Loan Calculator after results)
  const [params] = useState<AnalysisParams>({ ...DEFAULT_ANALYSIS_PARAMS });

  // Notify parent when analysis result changes (for Ask Will context)
  useEffect(() => {
    if (!result) {
      setAssistantContext(null);
      return;
    }
    const p = result.property_data;
    const r = result.analysis_results;
    setAssistantContext({
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
  }, [result, setAssistantContext]);

  // Auto-load analysis from URL param
  useEffect(() => {
    if (!analysisSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.getAnalysis(analysisSlug)
      .then((analysis) => {
        if (!cancelled) {
          setResult(analysis);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load analysis.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [analysisSlug, api]);

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
      const response = await api.runAnalysis({ url: url.trim(), params: autoParams });
      const { usage: runUsage, ...analysis } = response as PropertyAnalysis & { usage?: AnalysisUsageSummary };
      setResult(analysis as PropertyAnalysis);
      if (runUsage) setUsage(runUsage);
      else refreshUsage();
      setHistoryRefreshKey(k => k + 1);
      setInputExpanded(false);
      // Navigate to the analysis URL so it's shareable
      if (response.slug) {
        navigation.navigate({ kind: 'analyze', slug: response.slug }, { replace: true });
      }
    } catch (err: any) {
      const limitUsage = getAnalysisLimitUsage(err);
      if (limitUsage) {
        setUsage(limitUsage);
        setLimitDialogUsage(limitUsage);
      } else {
        setError(err.message || 'Analysis failed. Please check the URL and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [api, navigation, url, params, refreshUsage]);

  const handleBuyCredits = useCallback(() => {
    setLimitDialogUsage(null);
    usageAdapter?.openBilling();
  }, [usageAdapter]);

  const showUsage = Boolean(usageAdapter && usage && usage.mode === 'enforce' && !usage.exempt);

  const handleResultUpdate = useCallback((updated: PropertyAnalysis) => {
    setResult(updated);
    setHistoryRefreshKey(k => k + 1);
  }, []);

  const handleViewHistoryItem = useCallback((analysis: PropertyAnalysis) => {
    navigation.navigate({ kind: 'analyze', slug: analysis.slug });
  }, [navigation]);

  return (
    <div className="analyzer">
      {/* Page Header */}
      {!(result && activeTab === 'analyze') && (
        <div className="analyzer__header">
          <h1 className="page-title">{branding.productName}</h1>
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
              {showUsage && usage && <UsageMeter usage={usage} onBuyCredits={handleBuyCredits} />}
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
        <PropertyComparison onNewAnalysis={() => { setHistoryRefreshKey(k => k + 1); refreshUsage(); }} />
      )}

      {limitDialogUsage && (
        <UsageLimitDialog
          usage={limitDialogUsage}
          onBuyCredits={handleBuyCredits}
          onViewHistory={() => { setLimitDialogUsage(null); changeTab('history'); }}
          onClose={() => setLimitDialogUsage(null)}
        />
      )}
    </div>
  );
}
