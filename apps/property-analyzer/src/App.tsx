import { PropertyAnalyzerCore } from '@deal-platform/property-analyzer-core';
import { useAssetDashboardAnalyzer } from './wrapper/AssetDashboardAnalyzerContext';

export default function App() {
  const props = useAssetDashboardAnalyzer();
  return <PropertyAnalyzerCore {...props} />;
}
