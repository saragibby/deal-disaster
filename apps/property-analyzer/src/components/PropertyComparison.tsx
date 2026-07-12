import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { analyzerApi } from '@deal-platform/shared-auth';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import ComparisonSelector from './ComparisonSelector.js';
import ComparisonDashboard from './ComparisonDashboard.js';
import ComparisonSkeleton from './ComparisonSkeleton.js';

interface Props {
  onNewAnalysis?: () => void;
}

type Phase = 'selecting' | 'loading' | 'comparing';

export default function PropertyComparison({ onNewAnalysis }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('selecting');
  const [properties, setProperties] = useState<PropertyAnalysis[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);

  // Auto-load from URL params ?props=slug1,slug2,slug3
  useEffect(() => {
    const slugsParam = searchParams.get('props');
    if (!slugsParam) return;

    const slugs = slugsParam.split(',').filter(s => s.length > 0);
    if (slugs.length < 2) return;

    setPhase('loading');
    setLoadingError(null);

    Promise.allSettled(slugs.map(slug => analyzerApi.getAnalysis(slug)))
      .then(results => {
        const loaded: PropertyAnalysis[] = [];
        const errors: string[] = [];

        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            loaded.push(r.value);
          } else {
            errors.push(`Analysis ${slugs[i]} could not be loaded`);
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
    // Update URL with slugs for shareability
    const slugs = selected.map(p => p.slug).join(',');
    setSearchParams({ props: slugs }, { replace: true });
  }, [setSearchParams]);

  const handleBack = useCallback(() => {
    setPhase('selecting');
    setProperties([]);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const loadSlugs = useCallback((slugs: string[]) => {
    if (slugs.length < 2) return;
    setPhase('loading');
    setLoadingError(null);

    Promise.allSettled(slugs.map(slug => analyzerApi.getAnalysis(slug)))
      .then(results => {
        const loaded: PropertyAnalysis[] = [];
        const errors: string[] = [];

        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            loaded.push(r.value);
          } else {
            errors.push(`Analysis ${slugs[i]} could not be loaded`);
          }
        });

        if (loaded.length >= 2) {
          setProperties(loaded);
          setPhase('comparing');
          const validSlugs = loaded.map(p => p.slug).join(',');
          setSearchParams({ props: validSlugs }, { replace: true });
          if (errors.length > 0) {
            setLoadingError(errors.join('. '));
          }
        } else {
          setLoadingError(
            loaded.length === 0
              ? 'None of the saved analyses could be loaded. They may have been deleted.'
              : 'Only one property could be loaded. At least 2 are needed to compare.'
          );
          setPhase('selecting');
        }
      });
  }, [setSearchParams]);

  if (phase === 'loading') {
    return <ComparisonSkeleton />;
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
          onSaved={() => setSavedRefreshKey(k => k + 1)}
        />
      </>
    );
  }

  return (
    <ComparisonSelector
      onCompare={handleCompare}
      onNewAnalysis={onNewAnalysis}
      onLoadComparison={loadSlugs}
      savedRefreshKey={savedRefreshKey}
    />
  );
}
