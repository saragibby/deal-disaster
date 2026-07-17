import { useState, useEffect, useRef } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { Download, Printer } from 'lucide-react';
import AnalysisResults from './AnalysisResults';
import useExportAnalysis from '../hooks/useExportAnalysis';
import { usePropertyAnalyzerCore } from '../context.js';

export default function SharedAnalysisView({ slug }: { slug: string }) {
  const { adapters, branding, features, shellSlots } = usePropertyAnalyzerCore();
  const { api, navigation } = adapters;
  const [analysis, setAnalysis] = useState<PropertyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { exportToPdf, printAnalysis, exporting } = useExportAnalysis(resultsRef);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api.getSharedAnalysis(slug)
      .then(setAnalysis)
      .catch((err: any) => {
        setError(err.message || 'This analysis is not available.');
      })
      .finally(() => setLoading(false));
  }, [api, slug]);

  if (loading) {
    return (
      <div className="analyzer-app">
        <SharedHeader homeUrl={navigation.external('/')} loginUrl={navigation.external('/login')} branding={branding} />
        <main className="analyzer-app__content">
          <div className="analyzer__loading">
            <div className="analyzer-spinner" />
            <p>Loading shared analysis...</p>
          </div>
        </main>
        {shellSlots?.footer}
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="analyzer-app">
        <SharedHeader homeUrl={navigation.external('/')} loginUrl={navigation.external('/login')} branding={branding} />
        <main className="analyzer-app__content">
          <div className="shared-view__error">
            <h2>Analysis Not Available</h2>
            <p>{error || 'This shared analysis could not be found or sharing has been disabled by the owner.'}</p>
            <a href={navigation.external('/')} className="btn btn--primary">Go to Home</a>
          </div>
        </main>
        {shellSlots?.footer}
      </div>
    );
  }

  return (
    <div className="analyzer-app">
      <SharedHeader homeUrl={navigation.external('/')} loginUrl={navigation.external('/login')} branding={branding} />
      <main className="analyzer-app__content">
        <div className="shared-view">
          <div className="shared-view__banner">
            {shellSlots?.publicSharedBanner}
            <div className="shared-view__banner-actions no-print">
              {features.pdfExport && (
                <button
                  className="btn btn--outline btn--sm"
                  onClick={exportToPdf}
                  disabled={exporting}
                >
                  {exporting ? <span className="analyzer-spinner analyzer-spinner--sm" /> : <Download size={14} />}
                  {exporting ? 'Exporting...' : 'PDF'}
                </button>
              )}
              <button className="btn btn--outline btn--sm" onClick={printAnalysis}>
                <Printer size={14} /> Print
              </button>
            </div>
          </div>
          <div ref={resultsRef}>
            <AnalysisResults analysis={analysis} skipEntrance readOnly />
          </div>
        </div>
      </main>
      {shellSlots?.footer}
    </div>
  );
}

function SharedHeader({
  homeUrl,
  loginUrl,
  branding,
}: {
  homeUrl: string;
  loginUrl: string;
  branding: { platformName: string };
}) {
  return (
    <header className="analyzer-app__header">
      <a href={homeUrl} className="analyzer-app__logo">
        ⚡ {branding.platformName}
      </a>
      <nav className="analyzer-app__nav">
        <a href={homeUrl} className="analyzer-app__nav-link">Home</a>
        <a href={loginUrl} className="btn btn--primary btn--sm">Sign In</a>
      </nav>
    </header>
  );
}
