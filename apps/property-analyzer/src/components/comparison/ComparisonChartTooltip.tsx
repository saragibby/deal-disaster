import { fmt } from '../../utils/comparisonUtils.js';

interface Props {
  active?: boolean;
  payload?: any[];
  label?: string;
}

export default function ComparisonChartTooltip({ active, payload, label }: Props) {
  if (!active || !payload) return null;
  return (
    <div className="comparison-tooltip">
      <strong>{label}</strong>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' && Math.abs(p.value) >= 100
            ? fmt(p.value)
            : typeof p.value === 'number'
              ? p.value.toFixed(2) + '%'
              : p.value}
        </div>
      ))}
    </div>
  );
}
