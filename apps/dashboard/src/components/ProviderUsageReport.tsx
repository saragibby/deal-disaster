import { useEffect, useState } from 'react';
import { api } from '@deal-platform/shared-auth';
import type { ProviderUsageReport as UsageReport } from '@deal-platform/shared-types';
import './ProviderUsageReport.css';

const workflows = [
  'analysis', 'reanalysis', 'dataset-refresh', 'saved-view', 'property-records',
  'property-records-refresh', 'xome-widget', 'xome-prewarm', 'property-lookup',
  'comparison', 'other-analyzer', 'background',
];
const money = (value: number) => `$${value.toFixed(4)}`;
const perRequest = (total: number, requests: number) => requests ? (total / requests).toFixed(2) : '-';
const dateInput = (date: Date) => date.toISOString().slice(0, 10);

export default function ProviderUsageReport() {
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [workflow, setWorkflow] = useState('analysis');
  const [selection, setSelection] = useState({ from, to, workflow, refresh: 0 });
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setReport(null);
    const end = new Date(`${selection.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    if (!Number.isFinite(end.getTime())) {
      setError('Select a valid report date range.');
      setLoading(false);
      return;
    }
    api.getProviderUsageReport(selection.from, end.toISOString(), selection.workflow || undefined)
      .then(data => { if (active) setReport(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load usage.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection]);
  const totals = report?.totals;
  return (
    <section className="provider-usage" aria-label="Provider usage report">
      <h2>API usage and estimated cost</h2>
      <p>
        Backend provider requests only, across both analyzer wrappers. Choose one workflow when comparing
        periods; saved views and new analyses are not equivalent. Dates are UTC.
      </p>
      <form className="provider-usage__filters" onSubmit={event => {
        event.preventDefault();
        setSelection({ from, to, workflow, refresh: selection.refresh + 1 });
      }}>
        <label>From<input type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>Through<input type="date" required value={to} onChange={e => setTo(e.target.value)} /></label>
        <label>Workflow<select aria-label="Workflow" value={workflow} onChange={e => setWorkflow(e.target.value)}>
          <option value="">All workflows</option>
          {workflows.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button className="btn btn--primary btn--sm" disabled={loading}>Load report</button>
      </form>
      {loading && <p role="status">Loading usage report...</p>}
      {error && <p role="alert" className="admin-error">{error}</p>}
      {report && <>
        {!report.enabled && <p role="status">Persistence is disabled. Any historical records below remain readable.</p>}
        <p>
          Detailed records are retained for {report.retentionDays} days. Collection begins only when enabled;
          older logs are not imported. Estimates exclude subscription fees, allowances, unknown charges,
          browser map/photo traffic, and separate AI inference costs. Cache hits are reuse, not proven incremental savings.
          {' '}Collection is best-effort; check server reporting errors for gaps during outages or restarts.
        </p>
        {totals && <div className="provider-usage__metrics">
          <div><strong>{totals.requests}</strong>Recorded requests</div>
          <div><strong>{totals.attempts}</strong>Provider attempts</div>
          <div><strong>{perRequest(totals.attempts, totals.requests)}</strong>Calls / request</div>
          <div><strong>{money(totals.estimatedCostUsd)}</strong>Known scenario cost</div>
          <div><strong>{totals.requests ? money(totals.estimatedCostUsd / totals.requests) : '-'}</strong>Cost / request</div>
          <div><strong>{totals.requests > totals.failedRequests
            ? money(totals.estimatedCostUsd / (totals.requests - totals.failedRequests)) : '-'}</strong>Cost / completed request (includes failure costs)</div>
          <div><strong>{totals.failedRequests}</strong>Failed / aborted requests</div>
          <div><strong>{totals.unknownCostAttempts}</strong>Attempts with unknown cost</div>
        </div>}
        {!!totals?.pendingAttempts && <p role="alert">
          {totals.pendingAttempts} attempts were still pending when their summaries were logged. Costs may be incomplete.
        </p>}
        {!totals?.requests && <p>No recorded usage in this period. This is not evidence of zero provider usage before collection began.</p>}
        <h3>Daily workflow comparison</h3>
        <p>Compare like workflows and configurations. RentCast rates are scenarios, not invoice totals.</p>
        <div className="provider-usage__table">
          <table>
            <caption>Daily usage and rollout configuration</caption>
            <thead><tr>
              <th>UTC day</th><th>Workflow</th><th>Requests</th><th>Calls / request</th>
              <th>Cost / request</th><th>Failed</th><th>Unknown</th><th>Configuration</th>
            </tr></thead>
            <tbody>{report.workflows.map((row, i) => <tr key={i}>
              <td>{row.day}</td><td>{row.workflow}</td><td>{row.requests}</td>
              <td>{perRequest(row.attempts, row.requests)}</td>
              <td>{row.requests ? money(row.estimatedCostUsd / row.requests) : '-'}</td>
              <td>{row.failedRequests}</td><td>{row.unknownCostAttempts}</td>
              <td>ZIP cache {row.configuration.marketCache ? 'on' : 'off'}; property cache {row.configuration.propertyCache ? 'on' : 'off'};
                {' '}{row.configuration.rentMode}; RentCast {row.configuration.rentCastRate === null ? 'unknown' : money(row.configuration.rentCastRate)}/call</td>
            </tr>)}</tbody>
          </table>
        </div>
        <h3>Provider and endpoint breakdown</h3>
        <p>Cache counters are events, not unique lookups; misses from multiple layers must not be used as a hit-rate denominator.</p>
        <div className="provider-usage__table">
          <table>
            <caption>Provider attempts, reuse and failures</caption>
            <thead><tr>
              <th>Provider</th><th>Endpoint</th><th>Workflow</th><th>Attempts</th><th>Cost</th>
              <th>Unknown</th><th>Memory hits</th><th>DB hits</th><th>Cache misses</th>
              <th>Cache errors</th><th>HTTP errors</th><th>Network errors</th><th>Fallbacks</th>
            </tr></thead>
            <tbody>{report.endpoints.map(row => <tr key={`${row.provider}:${row.operation}:${row.workflow}`}>
              <td>{row.provider}</td><td>{row.operation}</td><td>{row.workflow}</td><td>{row.attempts}</td>
              <td>{money(row.estimatedCostUsd)}</td><td>{row.unknownCostAttempts}</td>
              <td>{row.memoryHits}</td><td>{row.postgresHits}</td><td>{row.cacheMisses}</td>
              <td>{row.cacheErrors}</td><td>{row.httpErrors}</td><td>{row.networkErrors}</td><td>{row.fallbacks}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
