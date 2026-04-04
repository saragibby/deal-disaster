import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Line,
} from 'recharts';
import type { CashFlowBreakdown, MortgageBreakdown, ROIMetrics } from '@deal-platform/shared-types';

interface Props {
  purchasePrice: number;
  cashFlow: CashFlowBreakdown;
  mortgage: MortgageBreakdown;
  roi: ROIMetrics;
  vacancyPct: number;
  annualAppreciation?: number;
}

interface YearData {
  year: string;
  cashFlow: number;
  principalPaydown: number;
  appreciation: number;
  total: number;
  remainingMortgage: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtAxis(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${Math.round(value / 1000)}k`;
  }
  return `$${Math.round(value)}`;
}

/**
 * Derive monthly interest rate from mortgage terms.
 * Solves: totalInterest = sum of interest over life of loan.
 * For a standard amortization: monthlyPayment = P * r / (1 - (1+r)^-n)
 * We use Newton's method to find r given P, monthlyPayment, and totalInterest.
 */
function deriveMonthlyRate(
  loanAmount: number,
  monthlyPayment: number,
  totalInterest: number,
): number | null {
  if (loanAmount <= 0 || monthlyPayment <= 0) return null;

  const totalPaid = totalInterest + loanAmount;
  const numPayments = Math.round(totalPaid / monthlyPayment);
  if (numPayments <= 0) return null;

  // Newton's method: find r where f(r) = P*r/(1-(1+r)^-n) - monthlyPayment = 0
  let r = 0.005; // initial guess ~6% annual
  for (let i = 0; i < 100; i++) {
    const pow = Math.pow(1 + r, -numPayments);
    const denom = 1 - pow;
    if (Math.abs(denom) < 1e-12) break;
    const f = (loanAmount * r) / denom - monthlyPayment;
    // derivative of f with respect to r
    const df =
      (loanAmount * denom - loanAmount * r * numPayments * Math.pow(1 + r, -numPayments - 1)) /
      (denom * denom);
    if (Math.abs(df) < 1e-12) break;
    const rNext = r - f / df;
    if (Math.abs(rNext - r) < 1e-10) {
      r = rNext;
      break;
    }
    r = Math.max(rNext, 1e-8);
  }

  return r > 0 && r < 1 ? r : null;
}

function computeProjection(
  purchasePrice: number,
  cashFlow: CashFlowBreakdown,
  mortgage: MortgageBreakdown,
  annualAppreciation: number,
  years: number,
): YearData[] {
  const monthlyRate = deriveMonthlyRate(
    mortgage.loanAmount,
    mortgage.monthlyPayment,
    mortgage.totalInterest,
  );

  const data: YearData[] = [];
  let cumulativePrincipal = 0;
  let balance = mortgage.loanAmount;

  for (let year = 0; year <= years; year++) {
    const cumCashFlow = cashFlow.annualCashFlow * year;

    // Principal paydown for this year
    if (year > 0 && monthlyRate !== null && balance > 0) {
      let yearPrincipal = 0;
      for (let m = 0; m < 12; m++) {
        if (balance <= 0) break;
        const interestPortion = balance * monthlyRate;
        const principalPortion = Math.min(
          mortgage.monthlyPayment - interestPortion,
          balance,
        );
        yearPrincipal += Math.max(principalPortion, 0);
        balance -= Math.max(principalPortion, 0);
      }
      cumulativePrincipal += yearPrincipal;
    }

    const appreciation =
      purchasePrice * (Math.pow(1 + annualAppreciation, year) - 1);

    data.push({
      year: `Year ${year}`,
      cashFlow: Math.round(cumCashFlow),
      principalPaydown: Math.round(cumulativePrincipal),
      appreciation: Math.round(appreciation),
      total: Math.round(cumCashFlow + cumulativePrincipal + appreciation),
      remainingMortgage: Math.round(Math.max(balance, 0)),
    });
  }

  return data;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="wealth-projection__tooltip">
      <p className="wealth-projection__tooltip-label">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="wealth-projection__tooltip-row"
          style={{ color: entry.color }}
        >
          {entry.name}: {fmt(entry.value)}
        </p>
      ))}
      <p className="wealth-projection__tooltip-total">
        Total: {fmt(total)}
      </p>
    </div>
  );
}

export default function WealthProjection({
  purchasePrice,
  cashFlow,
  mortgage,
  roi,
  vacancyPct: _vacancyPct,
  annualAppreciation = 0.03,
}: Props) {
  // Compute a generous chart range first, then find recoup from actual data
  const roughMonths = cashFlow.monthlyCashFlow > 0
    ? Math.ceil(roi.totalCashInvested / cashFlow.monthlyCashFlow)
    : -1;
  const maxChartYears = roughMonths > 0
    ? Math.min(Math.ceil(roughMonths / 12) + 2, 30) // +2 buffer beyond cash-flow-only estimate
    : 10;

  const data = useMemo(
    () => computeProjection(purchasePrice, cashFlow, mortgage, annualAppreciation, maxChartYears),
    [purchasePrice, cashFlow, mortgage, annualAppreciation, maxChartYears],
  );

  // Find recoup year from actual wealth data (cash flow + equity + appreciation)
  const recoupYearIndex = useMemo(() => {
    const target = roi.totalCashInvested;
    if (target <= 0) return 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i].total >= target) return i;
    }
    return -1; // never recoups within chart range
  }, [data, roi.totalCashInvested]);

  const recoupYears = recoupYearIndex > 0
    ? recoupYearIndex // already in years (each data point is a year)
    : -1;
  const showRecoup = recoupYearIndex > 0;

  // Round chart to nearest 5-year increment (e.g., recoup at 6yr → chart to 10yr)
  const rawChartEnd = showRecoup ? recoupYearIndex + 2 : maxChartYears;
  const chartYears = Math.max(Math.ceil(rawChartEnd / 5) * 5, 5);
  const trimmedData = data.slice(0, Math.min(chartYears + 1, data.length));

  const lastYear = trimmedData[trimmedData.length - 1];

  const breakEvenRent = cashFlow.totalMonthlyExpenses - cashFlow.monthlyVacancy;

  // Show appreciation and remaining mortgage at recoup time (or chart end if no recoup)
  const recoupData = showRecoup ? data[recoupYearIndex] : lastYear;
  const atRecoupYears = showRecoup ? recoupYearIndex : chartYears;

  const projectedAppreciation =
    purchasePrice * (Math.pow(1 + annualAppreciation, atRecoupYears) - 1);

  const recoupDisplay = recoupYears > 0
    ? `${recoupYears} year${recoupYears !== 1 ? 's' : ''}`
    : 'N/A (negative cash flow)';

  const recoupColorClass = recoupYears <= 0
    ? 'wealth-projection__metric-value--red'
    : recoupYears <= 5
      ? 'wealth-projection__metric-value--green'
      : recoupYears <= 10
        ? 'wealth-projection__metric-value--yellow'
        : 'wealth-projection__metric-value--red';

  return (
    <div className="wealth-projection">
      <h3 className="wealth-projection__title">Wealth Projection</h3>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={trimmedData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={55} />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: '11px' }} />
          <Area
            type="monotone"
            dataKey="cashFlow"
            name="Cash Flow"
            stackId="1"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.6}
          />
          <Area
            type="monotone"
            dataKey="principalPaydown"
            name="Principal Paydown"
            stackId="1"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.6}
          />
          <Area
            type="monotone"
            dataKey="appreciation"
            name="Appreciation"
            stackId="1"
            stroke="#a78bfa"
            fill="#a78bfa"
            fillOpacity={0.7}
          />
          <Line
            type="monotone"
            dataKey="remainingMortgage"
            name="Remaining Mortgage"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            fill="none"
          />
          {showRecoup && (
            <ReferenceLine
              x={`Year ${recoupYearIndex}`}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{ value: 'Recoup', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      <div className="wealth-projection__metrics">
        <div className="wealth-projection__metric">
          <span className="wealth-projection__metric-label">Total Cash Invested</span>
          <span className="wealth-projection__metric-value">
            {fmt(roi.totalCashInvested)}
          </span>
        </div>
        <div className="wealth-projection__metric">
          <span className="wealth-projection__metric-label">Break-Even Rent</span>
          <span className="wealth-projection__metric-value">
            {fmt(breakEvenRent)}/mo
          </span>
        </div>
        <div className="wealth-projection__metric">
          <span className="wealth-projection__metric-label">Time to Recoup</span>
          <span className={`wealth-projection__metric-value ${recoupColorClass}`}>
            {recoupDisplay}
          </span>
        </div>
        <div className="wealth-projection__metric">
          <span className="wealth-projection__metric-label">
            Appreciation {showRecoup ? `at Yr ${atRecoupYears}` : `at Yr ${chartYears}`}
          </span>
          <span className="wealth-projection__metric-value wealth-projection__metric-value--purple">
            {fmt(projectedAppreciation)}
          </span>
        </div>
        <div className="wealth-projection__metric">
          <span className="wealth-projection__metric-label">
            Mortgage {showRecoup ? `at Yr ${atRecoupYears}` : `at Yr ${chartYears}`}
          </span>
          <span className="wealth-projection__metric-value wealth-projection__metric-value--red">
            {fmt(recoupData.remainingMortgage)}
          </span>
        </div>
      </div>
    </div>
  );
}
