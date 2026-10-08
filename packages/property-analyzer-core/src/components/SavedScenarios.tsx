import { useEffect, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import type { AnalysisScenario, AnalysisScenarioInput } from '@deal-platform/shared-types';
import { usePropertyAnalyzerCore } from '../context.js';

interface Props {
  slug: string;
  current: Omit<AnalysisScenarioInput, 'name'>;
  onApply: (scenario: AnalysisScenario) => void;
  availableStrategies: Array<'ltr' | 'mtr' | 'str'>;
}

const money = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(n);
const strategyLabels = { ltr: 'Long-Term', mtr: 'Mid-Term', str: 'Short-Term' };

export default function SavedScenarios({ slug, current, onApply, availableStrategies }: Props) {
  const { adapters } = usePropertyAnalyzerCore();
  const [scenarios, setScenarios] = useState<AnalysisScenario[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    adapters.api.getScenarios(slug).then(items => {
      if (active) setScenarios(items);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Unable to load scenarios.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [adapters.api, slug, reload]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const scenario = await adapters.api.saveScenario(slug, { name: name.trim(), ...current });
      setScenarios(prev => [...prev, scenario]);
      setName('');
      setNotice(`Saved "${scenario.name}".`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save scenario.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (scenario: AnalysisScenario) => {
    if (!confirm(`Delete scenario "${scenario.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adapters.api.deleteScenario(slug, scenario.id);
      setScenarios(prev => prev.filter(item => item.id !== scenario.id));
      setNotice(`Deleted "${scenario.name}".`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete scenario.');
    } finally {
      setBusy(false);
    }
  };
  const columns = [
    { name: 'Current assumptions', ...current },
    ...scenarios,
  ];
  const rows: Array<{ label: string; value: (s: Omit<AnalysisScenarioInput, 'name'>) => string }> = [
    { label: 'Rental strategy', value: s => strategyLabels[s.overrides.selectedStrategy] },
    { label: 'Purchase price', value: s => money(s.metrics.purchasePrice) },
    { label: 'Down payment', value: s => `${s.overrides.params.downPaymentPct}%` },
    { label: 'Interest rate', value: s => `${s.overrides.params.interestRate}%` },
    { label: 'Loan term', value: s => `${s.overrides.params.loanTermYears} years` },
    { label: 'Monthly income', value: s => money(s.metrics.monthlyIncome) },
    { label: 'Monthly cash flow', value: s => money(s.metrics.monthlyCashFlow) },
    { label: 'Annual cash flow', value: s => money(s.metrics.monthlyCashFlow * 12) },
    { label: 'Cash invested', value: s => money(s.metrics.totalCashInvested) },
    { label: 'Cash-on-cash ROI', value: s => `${s.metrics.cashOnCashROI.toFixed(2)}%` },
    { label: 'Cap rate', value: s => `${s.metrics.capRate.toFixed(2)}%` },
  ];

  return (
    <section id="saved-scenarios" className="results__card results__section saved-scenarios">
      <h3 className="results__card-title">
        <span className="results__icon results__icon--blue"><GitCompareArrows size={20} /></span>
        Saved Scenarios
      </h3>
      <p className="results__card-subtitle">
        Save the current strategy and assumptions without changing the model baseline.
        Saved figures are snapshots, not refreshed valuations.
      </p>
      <form className="saved-scenarios__form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label htmlFor="scenario-name">Scenario name</label>
        <input id="scenario-name" value={name} onChange={e => setName(e.target.value)}
          maxLength={100} placeholder="e.g. STR base case" required />
        <button type="submit" className="results__reset-btn" disabled={busy || loading || !name.trim()}>
          Save current scenario
        </button>
      </form>
      {loading && <p role="status">Loading scenarios...</p>}
      {error && <p role="alert" className="ownership-history__error">{error}</p>}
      {error && !loading && (
        <button type="button" className="results__reset-btn" disabled={busy} onClick={() => setReload(n => n + 1)}>
          Reload scenarios
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loading && (
        <div className="saved-scenarios__table-wrap">
          <table>
            <thead><tr><th scope="col">Metric</th>{columns.map((column, index) => (
              <th scope="col" key={index}>{column.name}
                {index > 0 && <small>Saved {new Date(scenarios[index - 1].createdAt).toLocaleString()}</small>}
              </th>
            ))}</tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.label}><th scope="row">{row.label}</th>
                {columns.map((column, index) => <td key={index}>{row.value(column)}</td>)}
              </tr>
            ))}
              <tr><th scope="row">Actions</th><td>Live values</td>{scenarios.map(scenario => (
                <td key={scenario.id}>
                  <button type="button" className="results__reset-btn"
                    disabled={busy || !availableStrategies.includes(scenario.overrides.selectedStrategy)}
                    aria-label={`Apply ${scenario.name}`} onClick={() => {
                      onApply(scenario);
                      setNotice(`Applied "${scenario.name}". Live metrics use today's analysis data; current adjustments are auto-saved.`);
                    }}>Apply</button>
                  <button type="button" className="results__reset-btn" disabled={busy}
                    aria-label={`Delete ${scenario.name}`} onClick={() => void remove(scenario)}>Delete</button>
                  {!availableStrategies.includes(scenario.overrides.selectedStrategy) && (
                    <small>This strategy has no current estimate and cannot be applied.</small>
                  )}
                </td>
              ))}</tr>
            </tbody>
          </table>
        </div>
      )}
      {!loading && scenarios.length === 0 && !error && <p>No saved scenarios yet.</p>}
      <p className="ownership-history__source">
        Apply replaces current adjustments and recalculates using the current property estimates.
        Save your current assumptions first if you want to keep them.
      </p>
    </section>
  );
}
