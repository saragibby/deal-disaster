import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

interface Props {
  title: string | ReactNode;
  height?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export default function ComparisonChartCard({ title, height = 300, children, footer }: Props) {
  return (
    <div className="results__card comparison-dashboard__chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        {children as React.ReactElement}
      </ResponsiveContainer>
      {footer}
    </div>
  );
}
