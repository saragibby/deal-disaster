import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalyzerApiClient, MTREstimate, PropertyAnalysis } from '@deal-platform/shared-types';

export function useMtrNearby(analysis: PropertyAnalysis, api: AnalyzerApiClient, readOnly = false) {
  const baseline = analysis.analysis_results;
  const current = useRef(baseline);
  current.current = baseline;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const request = useRef<{ baseline: typeof baseline; status: 'loading' | 'loaded' | 'error' }>();
  const [state, setState] = useState<{
    baseline: typeof baseline; status: 'loading' | 'loaded' | 'error'; estimate?: MTREstimate; error?: string;
  }>();
  const load = useCallback((retry = false) => {
    if (readOnly || !api.loadMtrNearby || !analysis.slug || !baseline.mtrEstimate) return;
    const previous = request.current;
    if (previous?.baseline === baseline && (!retry || previous.status !== 'error')) return;
    request.current = { baseline, status: 'loading' };
    setState({ baseline, status: 'loading' });
    api.loadMtrNearby(analysis.slug).then(estimate => {
      if (!mounted.current || current.current !== baseline) return;
      request.current = { baseline, status: 'loaded' };
      setState({ baseline, status: 'loaded', estimate });
    }).catch((error: unknown) => {
      if (!mounted.current || current.current !== baseline) return;
      request.current = { baseline, status: 'error' };
      setState({ baseline, status: 'error', error: error instanceof Error ? error.message : 'Nearby places are unavailable.' });
    });
  }, [analysis.slug, api, baseline, readOnly]);
  const open = useCallback(() => load(), [load]);
  const retry = useCallback(() => load(true), [load]);
  const visible = state?.baseline === baseline ? state : undefined;
  return {
    results: visible?.estimate ? { ...baseline, mtrEstimate: visible.estimate } : baseline,
    status: visible?.status ?? ('idle' as const),
    error: visible?.error,
    enabled: !readOnly && !!api.loadMtrNearby,
    open, retry,
  };
}
