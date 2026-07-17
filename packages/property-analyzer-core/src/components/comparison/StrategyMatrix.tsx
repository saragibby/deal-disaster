import { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { fmt, shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';
import PropertyDot from './PropertyDot.js';
import { findExplainer } from '../TermExplainer';

function sourceLabel(source?: string): string {
  if (source === 'rentcast') return 'RentCast';
  if (source === 'airdna') return 'AirDNA';
  if (source === 'blended') return 'Blended';
  return 'Estimated';
}

function ConfidenceTag({ confidence, source }: { confidence?: string; source?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  if (!confidence) return null;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const reposition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const tr = triggerRef.current.getBoundingClientRect();
    const node = tooltipRef.current;
    node.style.top = `${tr.bottom + 4}px`;
    node.style.left = `${tr.left}px`;
    node.style.opacity = '1';
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const colors: Record<string, string> = { high: '#22c55e', medium: '#eab308', low: '#f97316' };
  const color = colors[confidence] || '#94a3b8';
  const explainer = findExplainer(`confidence ${confidence}`);
  return (
    <div className="comparison-dashboard__strategy-row" style={{ paddingTop: '0.25rem' }} ref={triggerRef}>
      <span>Data</span>
      <strong
        style={{ fontSize: '0.7rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color, textTransform: 'uppercase', marginRight: '0.3rem' }}>● {confidence}</span>
        {sourceLabel(source)}
      </strong>
      {open && explainer && createPortal(
        <div ref={tooltipRef} style={{
          position: 'fixed', top: -9999, left: 0, opacity: 0, zIndex: 99999,
          background: '#1e293b', color: '#e2e8f0', borderRadius: '0.5rem',
          padding: '0.75rem 1rem', maxWidth: 320, fontSize: '0.8rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
          lineHeight: 1.5, pointerEvents: 'auto'
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#60a5fa' }}>{explainer.term}</div>
          <p style={{ margin: 0, color: '#cbd5e1' }}>{explainer.definition}</p>
        </div>,
        document.body
      )}
    </div>
  );
}

interface Props {
  properties: PropertyAnalysis[];
}

interface StrategyEntry {
  name: string;
  color: string;
  ltr: {
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlyCashFlow: number;
    cocROI: number;
    confidence?: string;
    source?: string;
  };
  mtr: {
    occupancy: number;
    grossRevenue: number;
    costs: number;
    netRevenue: number;
    monthlyCashFlow: number;
    cocROI: number;
    confidence?: string;
    source?: string;
  } | null;
  str: {
    nightlyRate: number;
    occupancy: number;
    grossRevenue: number;
    costs: number;
    netRevenue: number;
    monthlyCashFlow: number;
    cocROI: number;
    confidence?: string;
    source?: string;
  } | null;
  winner: string;
}

export default function StrategyMatrix({ properties }: Props) {
  const strategyData: StrategyEntry[] = useMemo(() =>
    properties.map((p, i) => {
      const cf = p.analysis_results?.cashFlow;
      const str = p.analysis_results?.strEstimate;
      const mtr = p.analysis_results?.mtrEstimate;
      const roi = p.analysis_results?.roi;
      const ds = p.analysis_results?.dataSources;
      const monthlyRent = cf?.monthlyRent || 0;

      const expensesOnly = (cf?.monthlyMortgage || 0) + (cf?.monthlyTax || 0) + (cf?.monthlyInsurance || 0)
        + (cf?.monthlyVacancy || 0) + (cf?.monthlyRepairs || 0) + (cf?.monthlyCapex || 0) + (cf?.monthlyManagement || 0);
      const strMonthlyCF = str ? str.netMonthlyRevenue - expensesOnly : 0;
      const mtrMonthlyCF = mtr ? mtr.netMonthlyRevenue - expensesOnly : 0;
      const cashInvested = roi?.totalCashInvested || 1;

      const ltrCF = cf?.monthlyCashFlow || 0;
      const candidates: { label: string; cf: number }[] = [{ label: 'LTR', cf: ltrCF }];
      if (mtr) candidates.push({ label: 'MTR', cf: mtrMonthlyCF });
      if (str) candidates.push({ label: 'STR', cf: strMonthlyCF });
      const winner = candidates.reduce((best, c) => c.cf > best.cf ? c : best).label;

      return {
        name: shortAddr(p.property_data.address),
        color: PROPERTY_COLORS[i],
        ltr: {
          monthlyIncome: monthlyRent,
          monthlyExpenses: expensesOnly,
          monthlyCashFlow: ltrCF,
          cocROI: roi?.cashOnCashROI || 0,
          confidence: p.analysis_results?.rentalEstimate?.confidence,
          source: ds?.rental,
        },
        mtr: mtr ? {
          occupancy: mtr.occupancyRate * 100,
          grossRevenue: mtr.grossMonthlyRevenue,
          costs: mtr.utilityCosts + mtr.turnoverCosts + mtr.platformFees + mtr.managementCosts,
          netRevenue: mtr.netMonthlyRevenue,
          monthlyCashFlow: mtrMonthlyCF,
          cocROI: (mtrMonthlyCF * 12 / cashInvested) * 100,
          confidence: mtr.confidence,
          source: ds?.mtr,
        } : null,
        str: str ? {
          nightlyRate: str.nightlyRate,
          occupancy: str.occupancyRate * 100,
          grossRevenue: str.grossMonthlyRevenue,
          costs: str.cleaningCosts + str.platformFees,
          netRevenue: str.netMonthlyRevenue,
          monthlyCashFlow: strMonthlyCF,
          cocROI: (strMonthlyCF * 12 / cashInvested) * 100,
          confidence: str.confidence,
          source: ds?.str,
        } : null,
        winner,
      };
    }),
  [properties]);

  return (
    <div className="results__card comparison-dashboard__strategy">
      <h3>Rental Strategy Comparison</h3>
      <div className="comparison-dashboard__strategy-grid">
        {strategyData.map((s, i) => (
          <div key={i} className="comparison-dashboard__strategy-card" style={{ borderTopColor: s.color }}>
            <div className="comparison-dashboard__strategy-header">
              <PropertyDot color={s.color} />
              <strong>{s.name}</strong>
              <span className={`comparison-dashboard__strategy-winner comparison-dashboard__strategy-winner--${s.winner.toLowerCase()}`}>
                {s.winner} wins
              </span>
            </div>
            <div className="comparison-dashboard__strategy-cols">
              <div className="comparison-dashboard__strategy-col">
                <h4>Long-Term Rental</h4>
                <div className="comparison-dashboard__strategy-row">
                  <span>Monthly Income</span>
                  <strong>{fmt(s.ltr.monthlyIncome)}</strong>
                </div>
                <div className="comparison-dashboard__strategy-row">
                  <span>Monthly Expenses</span>
                  <strong className="text--negative">{fmt(s.ltr.monthlyExpenses)}</strong>
                </div>
                <div className="comparison-dashboard__strategy-row">
                  <span>Cash Flow</span>
                  <strong className={s.ltr.monthlyCashFlow >= 0 ? 'text--positive' : 'text--negative'}>
                    {fmt(s.ltr.monthlyCashFlow)}/mo
                  </strong>
                </div>
                <div className="comparison-dashboard__strategy-row">
                  <span>CoC ROI</span>
                  <strong>{s.ltr.cocROI.toFixed(2)}%</strong>
                </div>
                <div className="comparison-dashboard__strategy-row">
                  <span>Management</span>
                  <strong style={{ color: '#3b82f6' }}>Low</strong>
                </div>
                <ConfidenceTag confidence={s.ltr.confidence} source={s.ltr.source} />
              </div>
              {s.mtr ? (
                <div className="comparison-dashboard__strategy-col">
                  <h4>Mid-Term Rental</h4>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Occupancy</span>
                    <strong>{s.mtr.occupancy.toFixed(0)}%</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Gross Revenue</span>
                    <strong>{fmt(s.mtr.grossRevenue)}</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Cash Flow</span>
                    <strong className={s.mtr.monthlyCashFlow >= 0 ? 'text--positive' : 'text--negative'}>
                      {fmt(s.mtr.monthlyCashFlow)}/mo
                    </strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>CoC ROI</span>
                    <strong>{s.mtr.cocROI.toFixed(2)}%</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Management</span>
                    <strong style={{ color: '#22c55e' }}>Medium</strong>
                  </div>
                  <ConfidenceTag confidence={s.mtr.confidence} source={s.mtr.source} />
                </div>
              ) : (
                <div className="comparison-dashboard__strategy-col comparison-dashboard__strategy-col--empty">
                  <h4>Mid-Term Rental</h4>
                  <p>No MTR data available</p>
                </div>
              )}
              {s.str ? (
                <div className="comparison-dashboard__strategy-col">
                  <h4>Short-Term Rental</h4>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Nightly Rate</span>
                    <strong>{fmt(s.str.nightlyRate)}</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Occupancy</span>
                    <strong>{s.str.occupancy.toFixed(0)}%</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Gross Revenue</span>
                    <strong>{fmt(s.str.grossRevenue)}</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Cash Flow</span>
                    <strong className={s.str.monthlyCashFlow >= 0 ? 'text--positive' : 'text--negative'}>
                      {fmt(s.str.monthlyCashFlow)}/mo
                    </strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>CoC ROI</span>
                    <strong>{s.str.cocROI.toFixed(2)}%</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Management</span>
                    <strong style={{ color: '#a855f7' }}>High</strong>
                  </div>
                  <ConfidenceTag confidence={s.str.confidence} source={s.str.source} />
                </div>
              ) : (
                <div className="comparison-dashboard__strategy-col comparison-dashboard__strategy-col--empty">
                  <h4>Short-Term Rental</h4>
                  <p>No STR data available</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
