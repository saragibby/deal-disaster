import type { ReactElement } from 'react';
import type { PropertyAnalyzerCoreProps } from '@deal-platform/shared-types';

export type {
  AIComparisonSummary,
  AIPropertyNarrative,
  AnalysisParams,
  AnalyzerApiAdapter,
  AnalyzerApiClient,
  AnalyzerAssistantContext,
  AnalyzerAuthAdapter,
  AnalyzerDerivedAdjustments,
  AnalyzerError,
  AnalyzerErrorCode,
  AnalyzerExportKind,
  AnalyzerNavigationAdapter,
  AnalyzerNavigationOptions,
  AnalyzerPermission,
  AnalyzerPlatform,
  AnalyzerRoute,
  AnalyzerSession,
  AnalyzerSessionRequirement,
  AnalyzerShareState,
  AnalyzerShareUrlBuilder,
  AnalyzerStorageAdapter,
  OwnerContext,
  PageInput,
  PagedResult,
  PropertyAnalysis,
  PropertyAnalyzerAdapters,
  PropertyAnalyzerBranding,
  PropertyAnalyzerCoreEvents,
  PropertyAnalyzerCoreProps,
  PropertyAnalyzerFeatureFlags,
  PropertyAnalyzerShellSlots,
  RunAnalysisInput,
  SaveAdjustmentsPayload,
  SavedComparison,
} from '@deal-platform/shared-types';

export function PropertyAnalyzerCore({ shellSlots }: PropertyAnalyzerCoreProps): ReactElement | null {
  return shellSlots?.loadingFallback ? <>{shellSlots.loadingFallback}</> : null;
}

export default PropertyAnalyzerCore;
