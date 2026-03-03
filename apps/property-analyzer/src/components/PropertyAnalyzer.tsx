import { useState, useCallback } from 'react';
import { api } from '@deal-platform/shared-auth';
import type {
  PropertyAnalysis,
  AnalysisParams,
} from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';
import { Search, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import TermExplainer, { findExplainer } from './TermExplainer';
import AnalysisResults from './AnalysisResults.js';
import AnalysisHistory from './AnalysisHistory.js';

export default function PropertyAnalyzer() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyAnalysis | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<'analyze' | 'history'>('analyze');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Advanced params — start with defaults
  const [params, setParams] = useState<AnalysisParams>({ ...DEFAULT_ANALYSIS_PARAMS });

  const updateParam = (key: keyof AnalysisParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

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
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }, [url, params]);

  const handleViewHistoryItem = useCallback((analysis: PropertyAnalysis) => {
    setResult(analysis);
    setActiveTab('analyze');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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

            {/* Advanced Options Toggle */}
            <button
              className="analyzer__advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Settings size={14} />
              Advanced Options
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div className="analyzer__advanced">
                <div className="analyzer__params-grid">
                  <ParamInput label="Down Payment %" value={params.downPaymentPct} onChange={v => updateParam('downPaymentPct', v)} min={0} max={100} step={1} />
                  <ParamInput label="Interest Rate %" value={params.interestRate} onChange={v => updateParam('interestRate', v)} min={0} max={15} step={0.1} />
                  <ParamInput label="Loan Term (yrs)" value={params.loanTermYears} onChange={v => updateParam('loanTermYears', v)} min={1} max={40} step={1} />
                  <ParamInput label="Vacancy %" value={params.vacancyPct} onChange={v => updateParam('vacancyPct', v)} min={0} max={25} step={1} />
                  <ParamInput label="Repairs %" value={params.repairsPct} onChange={v => updateParam('repairsPct', v)} min={0} max={25} step={1} />
                  <ParamInput label="CapEx %" value={params.capexPct} onChange={v => updateParam('capexPct', v)} min={0} max={25} step={1} />
                  <ParamInput label="Mgmt %" value={params.managementPct} onChange={v => updateParam('managementPct', v)} min={0} max={15} step={1} />
                  <ParamInput label="Property Tax $/yr" value={params.annualPropertyTax} onChange={v => updateParam('annualPropertyTax', v)} min={0} max={50000} step={100} />
                  <ParamInput label="Insurance $/yr" value={params.annualInsurance} onChange={v => updateParam('annualInsurance', v)} min={0} max={20000} step={100} />
                  <ParamInput label="Cost Seg %" value={params.costSegPct} onChange={v => updateParam('costSegPct', v)} min={10} max={35} step={0.5} />
                  <ParamInput label="Tax Rate %" value={params.taxRate} onChange={v => updateParam('taxRate', v)} min={0} max={50} step={1} />
                </div>
              </div>
            )}
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
    </div>
  );
}

// ── Reusable parameter input ────────────────────────────────────────────

function ParamInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  const explainer = findExplainer(label);
  return (
    <div className="param-input">
      <label className="param-input__label">
        {label}
        {explainer && <TermExplainer info={explainer} />}
      </label>
      <input
        type="number"
        className="param-input__field"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}
