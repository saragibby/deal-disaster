import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Label,
} from 'recharts';
import type { CashFlowBreakdown } from '@deal-platform/shared-types';

interface Props {
  cashFlow: CashFlowBreakdown;
}

interface Segment {
  name: string;
  value: number;
  color: string;
}

const SEGMENTS: { key: keyof CashFlowBreakdown; label: string; color: string }[] = [
  { key: 'monthlyMortgage',   label: 'Mortgage',   color: '#3b82f6' },
  { key: 'monthlyTax',        label: 'Tax',        color: '#f59e0b' },
  { key: 'monthlyInsurance',  label: 'Insurance',  color: '#8b5cf6' },
  { key: 'monthlyHoa',        label: 'HOA',        color: '#ec4899' },
  { key: 'monthlyVacancy',    label: 'Vacancy',    color: '#ef4444' },
  { key: 'monthlyRepairs',    label: 'Repairs',    color: '#f97316' },
  { key: 'monthlyCapex',      label: 'CapEx',      color: '#14b8a6' },
  { key: 'monthlyManagement', label: 'Management', color: '#6366f1' },
];

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function CenterLabel({ viewBox, total }: { viewBox?: { cx: number; cy: number }; total: number }) {
  if (!viewBox) return null;
  const { cx, cy } = viewBox;
  return (
    <>
      <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="central"
        className="expense-donut__center-amount">
        {fmt(total)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central"
        className="expense-donut__center-label">
        Total Expenses
      </text>
    </>
  );
}

function CustomTooltip({ active, payload, total }: {
  active?: boolean;
  payload?: { payload: Segment }[];
  total: number;
}) {
  if (!active || !payload?.[0]) return null;
  const { name, value, color } = payload[0].payload;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <div className="expense-donut__tooltip">
      <span className="expense-donut__tooltip-dot" style={{ background: color }} />
      <span className="expense-donut__tooltip-name">{name}</span>
      <span className="expense-donut__tooltip-value">{fmt(value)}</span>
      <span className="expense-donut__tooltip-pct">({pct}%)</span>
    </div>
  );
}

export default function ExpenseDonut({ cashFlow }: Props) {
  const { data, total } = useMemo(() => {
    const segments: Segment[] = [];
    for (const s of SEGMENTS) {
      const v = cashFlow[s.key] as number;
      if (v > 0) segments.push({ name: s.label, value: v, color: s.color });
    }
    return { data: segments, total: cashFlow.totalMonthlyExpenses };
  }, [cashFlow]);

  if (data.length === 0) return null;

  return (
    <div className="expense-donut">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((seg) => (
              <Cell key={seg.name} fill={seg.color} />
            ))}
            <Label
              content={<CenterLabel total={total} />}
              position="center"
            />
          </Pie>
          <Tooltip content={<CustomTooltip total={total} />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="expense-donut__legend">
        {data.map((seg) => (
          <span key={seg.name} className="expense-donut__legend-item">
            <span className="expense-donut__legend-dot" style={{ background: seg.color }} />
            {seg.name}
          </span>
        ))}
      </div>
    </div>
  );
}
