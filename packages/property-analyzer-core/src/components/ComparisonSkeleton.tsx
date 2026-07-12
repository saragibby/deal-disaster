import { useState, useEffect } from 'react';

const STEPS = [
  'Loading property data…',
  'Building comparison metrics…',
  'Crunching the numbers…',
  'Almost ready…',
];

function SkeletonBar({ width = '100%', height = 14 }: { width?: string; height?: number }) {
  return <div className="skel-bar" style={{ width, height }} />;
}

export default function ComparisonSkeleton() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 6000;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * 92));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s < STEPS.length - 1 ? s + 1 : s));
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="comparison-dashboard comp-skel">
      {/* Progress bar */}
      <div className="skel-progress">
        <div className="skel-progress__track">
          <div className="skel-progress__fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="skel-progress__meta">
          <span className="skel-progress__step">{STEPS[step]}</span>
          <span className="skel-progress__pct">{progress}%</span>
        </div>
      </div>

      {/* Header */}
      <div className="comparison-dashboard__header comp-skel__header skel-section">
        <SkeletonBar width="100px" height={32} />
        <SkeletonBar width="250px" height={26} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <SkeletonBar width="80px" height={32} />
          <SkeletonBar width="80px" height={32} />
        </div>
      </div>

      {/* Snapshot banner */}
      <div className="comparison-dashboard__snapshot comp-skel__snapshot skel-section">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="comp-skel__snapshot-card">
            <div className="skel-circle" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              <SkeletonBar width="60%" height={11} />
              <SkeletonBar width="45%" height={18} />
              <SkeletonBar width="70%" height={10} />
            </div>
          </div>
        ))}
      </div>

      {/* Property cards row */}
      <div className="comparison-dashboard__cards skel-section">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="comparison-dashboard__card comp-skel__prop-card">
            <div className="comp-skel__prop-img" />
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <SkeletonBar width="80%" height={16} />
              <SkeletonBar width="55%" height={12} />
              <SkeletonBar width="35%" height={22} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <SkeletonBar width="30%" height={12} />
                <SkeletonBar width="30%" height={12} />
                <SkeletonBar width="30%" height={12} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts — two columns */}
      <div className="comparison-dashboard__charts skel-section">
        <div className="comparison-dashboard__chart-card">
          <h3><SkeletonBar width="55%" height={18} /></h3>
          <div className="skel-chart" />
        </div>
        <div className="comparison-dashboard__chart-card">
          <h3><SkeletonBar width="50%" height={18} /></h3>
          <div className="skel-chart" />
        </div>
      </div>

      {/* Table */}
      <div className="results__card comp-skel__table skel-section">
        <SkeletonBar width="40%" height={20} />
        <div className="comp-skel__table-rows">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel-metric">
              <SkeletonBar width="35%" height={13} />
              <SkeletonBar width="20%" height={13} />
              <SkeletonBar width="20%" height={13} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
