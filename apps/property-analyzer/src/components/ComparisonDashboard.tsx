import { useRef, useState, useMemo, useCallback } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import useExportComparison from '../hooks/useExportComparison.js';
import { useAssetDashboardAnalyzer } from '../wrapper/AssetDashboardAnalyzerContext.js';
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
  onSaved?: () => void;
}

export default function ComparisonDashboard({ properties, onBack, onSaved }: Props) {
  const { adapters, features } = useAssetDashboardAnalyzer();
  const { api, shareUrls } = adapters;
  const dashboardRef = useRef<HTMLDivElement>(null);
  const { exportToPdf, exporting } = useExportComparison(dashboardRef);

  // Save comparison state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    const url = shareUrls.privateComparison(properties.map(p => p.slug));
    navigator.clipboard.writeText(url).then(() => {
      alert('Comparison link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  };

  const handleSave = useCallback(async () => {
    const addresses = properties
      .map(p => p.property_data?.address?.split(',')[0])
      .filter(Boolean);
    const defaultName = addresses.length > 0
      ? addresses.join(' vs ')
      : `Comparison (${properties.length} properties)`;
    const name = prompt('Name this comparison:', defaultName);
    if (!name) return;

    setSaving(true);
    try {
      const slugs = properties.map(p => p.slug);
      await api.saveComparison(name, slugs);
      setSaved(true);
      onSaved?.();
    } catch (err: any) {
      alert(err.message || 'Failed to save comparison.');
    } finally {
      setSaving(false);
    }
  }, [api, properties, onSaved]);

  const printDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="comparison-dashboard" ref={dashboardRef}>
      {/* Print-only report header */}
      <div className="print-header">
        <div className="print-header__top">
          <h1 className="print-header__title">⚡ Property Comparison Report</h1>
          <span className="print-header__date">{printDate}</span>
        </div>
        <div className="print-header__properties">
          {properties.map((p, i) => (
            <span key={p.slug ?? i} className="print-header__property">
              {p.property_data?.address || `Property ${i + 1}`}
            </span>
          ))}
        </div>
      </div>
      <ComparisonHeader
        propertyCount={properties.length}
        onBack={onBack}
        onShare={handleShare}
        onExportPdf={features.pdfExport ? exportToPdf : undefined}
        onSave={features.savedComparisons ? handleSave : undefined}
        exporting={exporting}
        saving={saving}
        saved={saved}
      />
      <PropertyCards properties={adjusted} topPickIdx={dealSnapshot.topPickIdx} />
      <DealSnapshotBanner properties={adjusted} snapshot={dealSnapshot} />
      {features.aiComparisonSummary && <AIDealSummary properties={properties} />}
      <ScenarioSliders
        scenario={scenario}
        originalVacancyPct={avgVacancy}
        onChange={setScenario}
        onReset={resetScenario}
      />
      {features.aiPropertyNarratives && <AIPropertyNarratives properties={properties} />}
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
