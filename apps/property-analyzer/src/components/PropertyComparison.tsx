import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@deal-platform/shared-auth';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import ComparisonSelector from './ComparisonSelector.js';
import ComparisonDashboard from './ComparisonDashboard.js';

interface Props {
  onNewAnalysis?: () => void;
}

type Phase = 'selecting' | 'loading' | 'comparing';

export default function PropertyComparison({ onNewAnalysis }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('selecting');
  const [properties, setProperties] = useState<PropertyAnalysis[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Auto-load from URL params ?ids=1,5,12
  useEffect(() => {
    const idsParam = searchParams.get('ids');
    if (!idsParam) return;

    const ids = idsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    if (ids.length < 2) return;

    setPhase('loading');
    setLoadingError(null);

    Promise.allSettled(ids.map(id => api.getAnalysis(id)))
      .then(results => {
        const loaded: PropertyAnalysis[] = [];
        const errors: string[] = [];

        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const analysis = (r.value as any).analysis || r.value;
            loaded.push(analysis);
          } else {
            errors.push(`Analysis #${ids[i]} could not be loaded`);
          }
        });

        if (loaded.length >= 2) {
          setProperties(loaded);
          setPhase('comparing');
          if (errors.length > 0) {
            setLoadingError(errors.join('. '));
          }
        } else {
          setLoadingError(
            loaded.length === 0
              ? 'None of the shared analyses could be loaded. They may have been deleted.'
              : 'Only one property could be loaded. At least 2 are needed to compare.'
          );
          setPhase('selecting');
        }
      });
  }, []); // Only run on mount

  const handleCompare = useCallback((selected: PropertyAnalysis[]) => {
    setProperties(selected);
    setPhase('comparing');
    // Update URL with ids for shareability
    const ids = selected.map(p => p.id).join(',');
    setSearchParams({ ids }, { replace: true });
  }, [setSearchParams]);

  const handleBack = useCallback(() => {
    setPhase('selecting');
    setProperties([]);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  if (phase === 'loading') {
    return (
      <div className="comparison__loading">
        <div className="analyzer-spinner" />
        <p>Loading shared comparison...</p>
      </div>
    );
  }

  if (phase === 'comparing' && properties.length >= 2) {
    return (
      <>
        {loadingError && (
          <div className="analyzer__error" style={{ marginBottom: '1rem' }}>
            ⚠️ {loadingError}
          </div>
        )}
        <ComparisonDashboard
          properties={properties}
          onBack={handleBack}
        />
      </>
    );
  }

  return (
    <ComparisonSelector
      onCompare={handleCompare}
      onNewAnalysis={onNewAnalysis}
    />
  );
}
