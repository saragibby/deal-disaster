import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@deal-platform/shared-auth';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { Download, Printer } from 'lucide-react';
import { Footer } from '@deal-platform/shared-ui';
import AnalysisResults from './AnalysisResults';
import useExportAnalysis from '../hooks/useExportAnalysis';

export default function SharedAnalysisView() {
  const { slug } = useParams<{ slug: string }>();
  const [analysis, setAnalysis] = useState<PropertyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { exportToPdf, printAnalysis, exporting } = useExportAnalysis(resultsRef);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    api.getSharedAnalysis(slug)
      .then((resp: any) => {
        setAnalysis(resp.analysis || resp);
      })
      .catch((err: any) => {
        setError(err.message || 'This analysis is not available.');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="analyzer-app">
        <SharedHeader />
        <main className="analyzer-app__content">
          <div className="analyzer__loading">
            <div className="analyzer-spinner" />
            <p>Loading shared analysis...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="analyzer-app">
        <SharedHeader />
        <main className="analyzer-app__content">
          <div className="shared-view__error">
            <h2>Analysis Not Available</h2>
            <p>{error || 'This shared analysis could not be found or sharing has been disabled by the owner.'}</p>
            <a href="/" className="btn btn--primary">Go to Home</a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="analyzer-app">
      <SharedHeader />
      <main className="analyzer-app__content">
        <div className="shared-view">
          <div className="shared-view__banner">
            <span>📊 Shared Analysis — View Only</span>
            <div className="shared-view__banner-actions no-print">
              <button
                className="btn btn--outline btn--sm"
                onClick={exportToPdf}
                disabled={exporting}
              >
                {exporting ? <span className="analyzer-spinner analyzer-spinner--sm" /> : <Download size={14} />}
                {exporting ? 'Exporting...' : 'PDF'}
              </button>
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
      <Footer />
    </div>
  );
}

function SharedHeader() {
  return (
    <header className="analyzer-app__header">
      <a href="/" className="analyzer-app__logo">
        ⚡ Passive Income Club
      </a>
      <nav className="analyzer-app__nav">
        <a href="/" className="analyzer-app__nav-link">Home</a>
        <a href="/login" className="btn btn--primary btn--sm">Sign In</a>
      </nav>
    </header>
  );
}
