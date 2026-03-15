import { useState, useEffect } from 'react';

const STEPS = [
  'Looking up property details…',
  'Pulling comparable sales…',
  'Estimating rental income…',
  'Crunching cash flow numbers…',
  'Running investment analysis…',
  'Almost there…',
];

function SkeletonBar({ width = '100%', height = 14 }: { width?: string; height?: number }) {
  return <div className="skel-bar" style={{ width, height }} />;
}

function SectionSkeleton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="results__card skel-card skel-section">
      <h3 className="results__card-title skel-card__title">{title}</h3>
      {children}
    </div>
  );
}

function MetricRowSkeleton() {
  return (
    <div className="skel-metric">
      <SkeletonBar width="40%" height={13} />
      <SkeletonBar width="18%" height={13} />
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="skel-stat">
      <div className="skel-circle" />
      <SkeletonBar width="36px" height={16} />
      <SkeletonBar width="28px" height={10} />
    </div>
  );
}

export default function AnalysisSkeleton() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Animate progress from 0→92% over ~12s with easing
    const start = Date.now();
    const duration = 12000;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out: fast start, slows near end
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * 92));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s < STEPS.length - 1 ? s + 1 : s));
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="results skel-root">
      {/* Progress indicator */}
      <div className="skel-progress">
        <div className="skel-progress__track">
          <div className="skel-progress__fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="skel-progress__meta">
          <span className="skel-progress__step">{STEPS[step]}</span>
          <span className="skel-progress__pct">{progress}%</span>
        </div>
      </div>

      {/* Property Info Card */}
      <div className="results__card skel-card skel-section">
        <div className="results__property-top">
          <div className="results__property-info" style={{ width: '100%' }}>
            <div className="results__property-header">
              <div style={{ flex: 1 }}>
                <SkeletonBar width="60%" height={24} />
                <div style={{ marginTop: 8 }}>
                  <SkeletonBar width="35%" height={14} />
                </div>
              </div>
              <SkeletonBar width="140px" height={32} />
            </div>
            <div className="results__stats-row">
              {Array.from({ length: 5 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Two column grid — Rental + Cash Flow */}
      <div className="results__grid">
        <SectionSkeleton title="🏘️ Rental Estimate">
          <div className="skel-hero-block">
            <SkeletonBar width="45%" height={36} />
            <div style={{ marginTop: 8 }}>
              <SkeletonBar width="55%" height={12} />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricRowSkeleton key={i} />
          ))}
        </SectionSkeleton>

        <SectionSkeleton title="💵 Cash Flow Analysis">
          {Array.from({ length: 7 }).map((_, i) => (
            <MetricRowSkeleton key={i} />
          ))}
          <div className="skel-hero-block" style={{ marginTop: 12 }}>
            <SkeletonBar width="40%" height={36} />
            <div style={{ marginTop: 8 }}>
              <SkeletonBar width="50%" height={12} />
            </div>
          </div>
        </SectionSkeleton>
      </div>

      {/* Comparable Properties */}
      <SectionSkeleton title="🏡 Comparable Properties">
        <div className="skel-comp-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skel-comp">
              <SkeletonBar width="100%" height={16} />
              <SkeletonBar width="70%" height={13} />
              <div className="skel-comp__stats">
                <SkeletonBar width="30%" height={12} />
                <SkeletonBar width="30%" height={12} />
                <SkeletonBar width="30%" height={12} />
              </div>
            </div>
          ))}
        </div>
      </SectionSkeleton>

      {/* Trends row */}
      <div className="results__trends-grid">
        <SectionSkeleton title="🏠 Housing Market Trends">
          <div className="skel-chart" />
        </SectionSkeleton>
        <SectionSkeleton title="📊 Rental Market Trends">
          <div className="skel-chart" />
        </SectionSkeleton>
      </div>

      {/* Bottom grid — Foreclosures + Loan Calculator */}
      <div className="results__bottom-grid">
        <SectionSkeleton title="⚠️ Nearby Foreclosures">
          {Array.from({ length: 3 }).map((_, i) => (
            <MetricRowSkeleton key={i} />
          ))}
        </SectionSkeleton>
        <SectionSkeleton title="🐷 Loan Calculator">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricRowSkeleton key={i} />
          ))}
        </SectionSkeleton>
      </div>
    </div>
  );
}
