import { useMemo } from 'react';
import type { FullAnalysisResult } from '@deal-platform/shared-types';
import { ShieldCheck, ShieldAlert, Database } from 'lucide-react';

interface Props {
  results: FullAnalysisResult;
}

type Confidence = 'low' | 'medium' | 'high';

interface SourceRow {
  label: string;
  source: string;
  isData: boolean;
  confidence: Confidence;
}

const RENTAL_SOURCE: Record<string, { source: string; isData: boolean }> = {
  rentcast: { source: 'RentCast market data', isData: true },
  blended: { source: 'RentCast data + model blend', isData: true },
  algorithm: { source: 'Algorithmic estimate', isData: false },
};
const STR_SOURCE: Record<string, { source: string; isData: boolean }> = {
  airdna: { source: 'AirDNA market data', isData: true },
  mashvisor: { source: 'Mashvisor market data', isData: true },
  algorithm: { source: 'Algorithmic estimate', isData: false },
};
const MTR_SOURCE: Record<string, { source: string; isData: boolean }> = {
  'furnished-finder': { source: 'Furnished Finder data', isData: true },
  padsplit: { source: 'PadSplit data', isData: true },
  algorithm: { source: 'Algorithmic estimate', isData: false },
};

function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`data-confidence__pill data-confidence__pill--${confidence}`}>
      {confidence} confidence
    </span>
  );
}

export default function DataConfidenceBanner({ results }: Props) {
  const rows = useMemo<SourceRow[]>(() => {
    const out: SourceRow[] = [];
    const rentalSrc = results.dataSources?.rental ?? 'algorithm';
    out.push({
      label: 'Long-term rent',
      ...RENTAL_SOURCE[rentalSrc] ?? RENTAL_SOURCE.algorithm,
      confidence: results.rentalEstimate.confidence,
    });
    if (results.mtrEstimate) {
      const src = results.dataSources?.mtr ?? results.mtrEstimate.source;
      out.push({
        label: 'Mid-term rent',
        ...MTR_SOURCE[src] ?? MTR_SOURCE.algorithm,
        confidence: results.mtrEstimate.confidence,
      });
    }
    if (results.strEstimate) {
      const src = results.dataSources?.str ?? results.strEstimate.source;
      out.push({
        label: 'Short-term rent',
        ...STR_SOURCE[src] ?? STR_SOURCE.algorithm,
        confidence: results.strEstimate.confidence,
      });
    }
    return out;
  }, [results]);

  const hasLow = rows.some(r => r.confidence === 'low');
  const allData = rows.every(r => r.isData);

  return (
    <div className={`data-confidence ${hasLow ? 'data-confidence--warn' : 'data-confidence--ok'}`}>
      <div className="data-confidence__head">
        <span className="data-confidence__head-icon">
          {hasLow ? <ShieldAlert size={18} /> : allData ? <ShieldCheck size={18} /> : <Database size={18} />}
        </span>
        <div>
          <h4 className="data-confidence__title">
            {hasLow
              ? 'Some estimates are low-confidence — treat them as a starting point'
              : 'Where these numbers come from'}
          </h4>
          <p className="data-confidence__sub">
            {hasLow
              ? 'We show the source and confidence for every rent figure. Lower confidence means less local market data was available — verify against local comps before committing.'
              : 'Every rent figure is labeled with its data source and confidence so you can judge how much to trust it.'}
          </p>
        </div>
      </div>

      <ul className="data-confidence__rows">
        {rows.map(row => (
          <li key={row.label} className="data-confidence__row">
            <span className="data-confidence__label">{row.label}</span>
            <span className={`data-confidence__source ${row.isData ? 'data-confidence__source--data' : 'data-confidence__source--est'}`}>
              {row.source}
            </span>
            <ConfidencePill confidence={row.confidence} />
          </li>
        ))}
      </ul>
    </div>
  );
}
