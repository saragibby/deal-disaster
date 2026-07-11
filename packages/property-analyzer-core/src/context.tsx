import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type {
  AnalyzerAssistantContext,
  AnalyzerRoute,
  PropertyAnalyzerAdapters,
  PropertyAnalyzerBranding,
  PropertyAnalyzerFeatureFlags,
  PropertyAnalyzerShellSlots,
} from '@deal-platform/shared-types';

export type AnalyzerTab = 'analyze' | 'history' | 'compare';

export interface PropertyAnalyzerCoreContextValue {
  basePath: string;
  route: AnalyzerRoute;
  activeTab: AnalyzerTab;
  adapters: PropertyAnalyzerAdapters;
  features: PropertyAnalyzerFeatureFlags;
  branding: PropertyAnalyzerBranding;
  shellSlots?: PropertyAnalyzerShellSlots;
  assistantContext: AnalyzerAssistantContext | null;
  setAssistantContext(context: AnalyzerAssistantContext | null): void;
  changeTab(tab: AnalyzerTab): void;
}

const PropertyAnalyzerCoreContext = createContext<PropertyAnalyzerCoreContextValue | null>(null);

export function PropertyAnalyzerCoreProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: PropertyAnalyzerCoreContextValue;
}) {
  return (
    <PropertyAnalyzerCoreContext.Provider value={value}>
      {children}
    </PropertyAnalyzerCoreContext.Provider>
  );
}

export function usePropertyAnalyzerCore() {
  const context = useContext(PropertyAnalyzerCoreContext);
  if (!context) {
    throw new Error('usePropertyAnalyzerCore must be used within PropertyAnalyzerCoreProvider');
  }
  return context;
}
