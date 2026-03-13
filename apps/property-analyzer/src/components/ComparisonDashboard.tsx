import { useRef, useState, useMemo, useCallback } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import useExportComparison from '../hooks/useExportComparison.js';
import { type ScenarioParams, DEFAULT_SCENARIO, applyScenario } from '../utils/comparisonUtils.js';
import ComparisonHeader from './comparison/ComparisonHeader.js';
import DealSnapshotBanner, { useDealSnapshot } from './comparison/DealSnapshotBanner.js';
import PropertyCards from './comparison/PropertyCards.js';
import PropertyRadar from './comparison/PropertyRadar.js';
import CashFlowWaterfall from './comparison/CashFlowWaterfall.js';
import StrategyMatrix from './comparison/StrategyMatrix.js';
import BreakEvenAnalysis from './comparison/BreakEvenAnalysis.js';
import ComparisonMap from './comparison/ComparisonMap.js';
import ComparisonTable from './comparison/ComparisonTable.js';
import AIDealSummary from './comparison/AIDealSummary.js';
import AIPropertyNarratives from './comparison/AIPropertyNarratives.js';
import PriceHistoryTrends from './comparison/PriceHistoryTrends.js';
import ScenarioSliders from './comparison/ScenarioSliders.js';

interface Props {
  properties: PropertyAnalysis[];
  onBack: () => void;
}

export default function ComparisonDashboard({ properties, onBack }: Props) {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const { exportToPdf, printComparison, exporting } = useExportComparison(dashboardRef);

  // What-If scenario state
  const [scenario, setScenario] = useState<ScenarioParams>(DEFAULT_SCENARIO);
  const resetScenario = useCallback(() => setScenario(DEFAULT_SCENARIO), []);

  // Average original vacancy for slider default position
  const avgVacancy = useMemo(() => {
    const vals = properties.map(p => p.analysis_params?.vacancyPct ?? 8);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [properties]);

  // Scenario-adjusted properties (recalculated cash flow, ROI, tax savings)
  const adjusted = useMemo(
    () => properties.map(p => applyScenario(p, scenario)),
    [properties, scenario],
  );

  const dealSnapshot = useDealSnapshot(adjusted);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert('Comparison link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  };

  return (
    <div className="comparison-dashboard" ref={dashboardRef}>
      <ComparisonHeader
        propertyCount={properties.length}
        onBack={onBack}
        onShare={handleShare}
        onExportPdf={exportToPdf}
        onPrint={printComparison}
        exporting={exporting}
      />
      <DealSnapshotBanner properties={adjusted} snapshot={dealSnapshot} />
      <AIDealSummary properties={properties} />
      <ScenarioSliders
        scenario={scenario}
        originalVacancyPct={avgVacancy}
        onChange={setScenario}
        onReset={resetScenario}
      />
      <PropertyCards properties={adjusted} topPickIdx={dealSnapshot.topPickIdx} />
      <AIPropertyNarratives properties={properties} />
      <PropertyRadar properties={adjusted} />
      <CashFlowWaterfall properties={adjusted} />
      <StrategyMatrix properties={adjusted} />
      <BreakEvenAnalysis properties={adjusted} />
      <PriceHistoryTrends properties={properties} />
      <ComparisonMap properties={properties} />
      <ComparisonTable properties={adjusted} />
    </div>
  );
}
