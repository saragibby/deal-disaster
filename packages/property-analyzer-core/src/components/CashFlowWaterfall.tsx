import { useMemo } from 'react';
import type { CashFlowBreakdown } from '@deal-platform/shared-types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

interface Props {
  cashFlow: CashFlowBreakdown;
}

interface WaterfallEntry {
  name: string;
  value: number;
  base: number;
  display: number;
  type: 'income' | 'expense' | 'total';
}

const INCOME_COLOR = '#10b981';
const EXPENSE_COLOR = '#ef4444';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function buildWaterfall(cf: CashFlowBreakdown): WaterfallEntry[] {
  const rent = cf.monthlyRent;
  let running = rent;

  const entries: WaterfallEntry[] = [
    { name: 'Rent', value: rent, base: 0, display: rent, type: 'income' },
  ];

  const expenses: [string, number][] = [
    ['Mortgage', cf.monthlyMortgage],
    ['Tax', cf.monthlyTax],
    ['Insurance', cf.monthlyInsurance],
    ['HOA', cf.monthlyHoa],
    ['Vacancy', cf.monthlyVacancy],
    ['Repairs', cf.monthlyRepairs],
    ['CapEx', cf.monthlyCapex],
    ['Mgmt', cf.monthlyManagement],
  ];

  for (const [label, amount] of expenses) {
    if (amount <= 0) continue;
    running -= amount;
    entries.push({
      name: label,
      value: amount,
      base: Math.max(running, 0),
      display: -amount,
      type: 'expense',
    });
  }

  const cashFlow = cf.monthlyCashFlow;
  entries.push({
    name: 'Cash Flow',
    value: Math.abs(cashFlow),
    base: 0,
    display: cashFlow,
    type: 'total',
  });

  return entries;
}

function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload?.[1]) return null;
  const entry = payload[1].payload as WaterfallEntry;
  const sign = entry.display >= 0 ? '+' : '−';
  const color = entry.type === 'expense' || entry.display < 0 ? EXPENSE_COLOR : INCOME_COLOR;
  return (
    <div className="cashflow-waterfall__tooltip">
      <strong>{entry.name}</strong>
      <div style={{ color }}>{sign}{fmt(Math.abs(entry.display))}/mo</div>
    </div>
  );
}

export default function CashFlowWaterfall({ cashFlow }: Props) {
  const data = useMemo(() => buildWaterfall(cashFlow), [cashFlow]);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.base + d.value);
    return m * 1.1;
  }, [data]);

  return (
    <div className="cashflow-waterfall">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="15%">
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis
            domain={[0, maxVal]}
            tickFormatter={(v: number) =>
              `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`
            }
            width={52}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<WaterfallTooltip />} />
          <ReferenceLine y={0} stroke="#e2e8f0" />

          <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="a" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => {
              let fill: string;
              if (entry.type === 'income') fill = INCOME_COLOR;
              else if (entry.type === 'total') fill = entry.display >= 0 ? INCOME_COLOR : EXPENSE_COLOR;
              else fill = EXPENSE_COLOR;
              return <Cell key={i} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
