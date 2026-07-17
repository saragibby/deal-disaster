import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { TrendingUp, Target, DollarSign, Calendar, Shield } from 'lucide-react';
import { fmt, shortAddr, bestIdx } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';

type Winner = {
  label: string;
  icon: 'cashflow' | 'roi' | 'value' | 'str' | 'risk';
  propIdx: number;
  value: string;
};

export interface DealSnapshotData {
  winners: Winner[];
  topPickIdx: number;
}

export function useDealSnapshot(properties: PropertyAnalysis[]): DealSnapshotData {
  return useMemo(() => {
    const winners: Winner[] = [];

    const cfVals = properties.map(p => p.analysis_results?.cashFlow?.monthlyCashFlow || 0);
    const cfIdx = bestIdx(cfVals, true);
    if (cfIdx >= 0) winners.push({ label: 'Best Cash Flow', icon: 'cashflow', propIdx: cfIdx, value: fmt(cfVals[cfIdx]) + '/mo' });

    const roiVals = properties.map(p => p.analysis_results?.roi?.cashOnCashROI || 0);
    const roiIdx = bestIdx(roiVals, true);
    if (roiIdx >= 0) winners.push({ label: 'Best ROI', icon: 'roi', propIdx: roiIdx, value: roiVals[roiIdx].toFixed(2) + '%' });

    const psfVals = properties.map(p => p.property_data.sqft ? p.property_data.price / p.property_data.sqft : Infinity);
    const psfIdx = bestIdx(psfVals, false);
    if (psfIdx >= 0 && psfVals[psfIdx] < Infinity) winners.push({ label: 'Best Value', icon: 'value', propIdx: psfIdx, value: `$${Math.round(psfVals[psfIdx])}/sqft` });

    const strVals = properties.map(p => p.analysis_results?.strEstimate?.netMonthlyRevenue || 0);
    const strIdx = bestIdx(strVals, true);
    if (strIdx >= 0 && strVals[strIdx] > 0) winners.push({ label: 'Best STR Play', icon: 'str', propIdx: strIdx, value: fmt(strVals[strIdx]) + '/mo' });

    const confMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const riskVals = properties.map(p => {
      const conf = confMap[p.analysis_results?.rentalEstimate?.confidence || 'low'];
      const vacPct = p.analysis_params?.vacancyPct || 8;
      return conf * 100 - vacPct;
    });
    const riskIdx = bestIdx(riskVals, true);
    if (riskIdx >= 0) {
      const conf = properties[riskIdx].analysis_results?.rentalEstimate?.confidence || 'low';
      winners.push({ label: 'Lowest Risk', icon: 'risk', propIdx: riskIdx, value: conf.charAt(0).toUpperCase() + conf.slice(1) + ' confidence' });
    }

    const wins: Record<number, number> = {};
    winners.forEach(w => { wins[w.propIdx] = (wins[w.propIdx] || 0) + 1; });
    const topPickIdx = Object.entries(wins).find(([, count]) => count >= 3)?.[0];

    return { winners, topPickIdx: topPickIdx != null ? Number(topPickIdx) : -1 };
  }, [properties]);
}

const iconMap = {
  cashflow: <TrendingUp size={16} />,
  roi: <Target size={16} />,
  value: <DollarSign size={16} />,
  str: <Calendar size={16} />,
  risk: <Shield size={16} />,
};

interface Props {
  properties: PropertyAnalysis[];
  snapshot: DealSnapshotData;
}

export default function DealSnapshotBanner({ properties, snapshot }: Props) {
  return (
    <div className="comparison-dashboard__snapshot">
      {snapshot.winners.map(w => (
        <div key={w.label} className="comparison-dashboard__snapshot-card">
          <div className="comparison-dashboard__snapshot-icon" style={{ color: PROPERTY_COLORS[w.propIdx] }}>
            {iconMap[w.icon]}
          </div>
          <div className="comparison-dashboard__snapshot-info">
            <span className="comparison-dashboard__snapshot-label">{w.label}</span>
            <span className="comparison-dashboard__snapshot-value">{w.value}</span>
            <span className="comparison-dashboard__snapshot-prop" style={{ color: PROPERTY_COLORS[w.propIdx] }}>
              {shortAddr(properties[w.propIdx].property_data.address)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
