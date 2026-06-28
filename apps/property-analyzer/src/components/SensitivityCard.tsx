import { useMemo } from 'react';
import type { AnalysisParams } from '@deal-platform/shared-types';
import { Activity, DollarSign, Tag, Percent } from 'lucide-react';
import { calculateMortgage, calculateCashFlow } from '../utils/calculations';

interface Props {
  params: AnalysisParams;
  /** Effective purchase price (offer price if set, otherwise list price). */
  price: number;
  /** Effective monthly rent (rent override if set, otherwise estimate mid). */
  rent: number;
  /** Render as a compact 3-card block (e.g. embedded above the wealth chart). */
  embedded?: boolean;
}

const money = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const ratePct = (n: number) => `${n.toFixed(2)}%`;

/**
 * Find the driver value at which monthly cash flow crosses $0, via bisection.
 * `cfAt` must be monotonic over [lo, hi]. Returns null when cash flow never
 * crosses zero across the tested range (i.e. it's positive or negative
 * throughout).
 */
function solveBreakEven(cfAt: (x: number) => number, lo: number, hi: number): number | null {
  let flo = cfAt(lo);
  let fhi = cfAt(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo > 0 === fhi > 0) return null; // no sign change → no crossing in range
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fmid = cfAt(mid);
    if (Math.abs(fmid) < 0.01) return mid;
    if (fmid > 0 === flo > 0) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
      fhi = fmid;
    }
  }
  return (lo + hi) / 2;
}

interface DriverRow {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Which direction keeps cash flow positive. */
  safeSide: 'high' | 'low';
  current: number;
  breakEven: number | null;
  /** True when cash flow is positive across the whole tested range. */
  alwaysSafe: boolean;
  rangeMin: number;
  rangeMax: number;
  format: (n: number) => string;
  tone: 'safe' | 'risk';
  cushion: string;
}

export default function SensitivityCard({ params, price, rent, embedded = false }: Props) {
  const drivers = useMemo<DriverRow[]>(() => {
    // Cash flow for a single overridden driver; everything else held constant.
    // Price/rate flow through the mortgage; rent flows through income + the
    // rent-scaled reserves — matching the live Cash Flow model exactly.
    const cfAt = (o: { rent?: number; price?: number; rate?: number }) => {
      const p = o.price ?? price;
      const r = o.rate ?? params.interestRate;
      const rentVal = o.rent ?? rent;
      const m = calculateMortgage(p, params.downPaymentPct, r, params.loanTermYears);
      return calculateCashFlow(rentVal, m, params).monthlyCashFlow;
    };

    const build = (
      key: string,
      label: string,
      icon: React.ReactNode,
      safeSide: 'high' | 'low',
      current: number,
      lo: number,
      hi: number,
      cfAtVal: (x: number) => number,
      format: (n: number) => string,
      cushionFor: (breakEven: number | null, alwaysSafe: boolean) => { tone: 'safe' | 'risk'; cushion: string },
    ): DriverRow => {
      const breakEven = solveBreakEven(cfAtVal, lo, hi);
      // When there's no crossing, decide whether the whole range is safe by
      // sampling the side that should be safest.
      const probe = safeSide === 'high' ? cfAtVal(hi) : cfAtVal(lo);
      const alwaysSafe = breakEven == null && probe >= 0;
      const anchorHi = Math.max(current, breakEven ?? current);
      const anchorLo = Math.min(current, breakEven ?? current);
      const pad = (anchorHi - anchorLo) * 0.45 || Math.abs(current) * 0.2 || 1;
      const rangeMin = Math.max(0, anchorLo - pad);
      const rangeMax = anchorHi + pad;
      const { tone, cushion } = cushionFor(breakEven, alwaysSafe);
      return { key, label, icon, safeSide, current, breakEven, alwaysSafe, rangeMin, rangeMax, format, tone, cushion };
    };

    const rows: DriverRow[] = [];

    // ── Rent ── higher rent = safer
    rows.push(
      build(
        'rent',
        'Monthly rent',
        <DollarSign size={15} />,
        'high',
        rent,
        0,
        Math.max(rent * 2.5, 8000),
        (x) => cfAt({ rent: x }),
        (n) => `${money(n)}/mo`,
        (be, alwaysSafe) => {
          if (be == null) {
            return alwaysSafe
              ? { tone: 'safe', cushion: 'Cash-flow positive across the tested rent range.' }
              : { tone: 'risk', cushion: 'Stays negative across the tested rent range.' };
          }
          const c = rent - be;
          return c >= 0
            ? { tone: 'safe', cushion: `${money(c)}/mo cushion — rent could drop to ${money(be)} before you're underwater.` }
            : { tone: 'risk', cushion: `Rent must rise ${money(-c)}/mo (to ${money(be)}) just to break even.` };
        },
      ),
    );

    // ── Purchase price ── lower price = safer
    rows.push(
      build(
        'price',
        'Purchase price',
        <Tag size={15} />,
        'low',
        price,
        Math.max(price * 0.2, 1),
        price * 2.5,
        (x) => cfAt({ price: x }),
        (n) => money(n),
        (be, alwaysSafe) => {
          if (be == null) {
            return alwaysSafe
              ? { tone: 'safe', cushion: 'Cash-flow positive across the tested price range.' }
              : { tone: 'risk', cushion: 'Stays negative across the tested price range.' };
          }
          const room = be - price;
          return room >= 0
            ? { tone: 'safe', cushion: `Room to pay up to ${money(be)} — ${money(room)} above your price and still break even.` }
            : { tone: 'risk', cushion: `Overpriced for cash flow — price must drop ${money(-room)} (to ${money(be)}) to break even.` };
        },
      ),
    );

    // ── Interest rate ── lower rate = safer
    rows.push(
      build(
        'rate',
        'Interest rate',
        <Percent size={15} />,
        'low',
        params.interestRate,
        0.1,
        20,
        (x) => cfAt({ rate: x }),
        (n) => ratePct(n),
        (be, alwaysSafe) => {
          if (be == null) {
            return alwaysSafe
              ? { tone: 'safe', cushion: 'Cash-flow positive across the tested rate range.' }
              : { tone: 'risk', cushion: 'Stays negative across the tested rate range.' };
          }
          const headroom = be - params.interestRate;
          return headroom >= 0
            ? { tone: 'safe', cushion: `${headroom.toFixed(2)} pts of headroom — breaks even at a ${ratePct(be)} rate.` }
            : { tone: 'risk', cushion: `Rate must fall ${Math.abs(headroom).toFixed(2)} pts (to ${ratePct(be)}) to break even.` };
        },
      ),
    );

    return rows;
  }, [params, price, rent]);

  const pos = (row: DriverRow, v: number) =>
    Math.max(0, Math.min(100, ((v - row.rangeMin) / (row.rangeMax - row.rangeMin)) * 100));

  return (
    <div className={`sensitivity${embedded ? ' sensitivity--embedded' : ''}`}>
      {embedded ? (
        <div className="sensitivity__embedded-head">
          <h4 className="sensitivity__embedded-title">
            <Activity size={16} />
            Stress Test
          </h4>
          <p className="sensitivity__intro">
            How far each assumption can move before this deal stops cash-flowing.
          </p>
        </div>
      ) : (
        <>
          <h3 className="results__card-title">
            <span className="results__icon results__icon--amber"><Activity size={18} /></span>
            Stress Test
          </h3>
          <p className="sensitivity__intro">
            How much each assumption can move before this deal stops cash-flowing. The marker is today's
            value; the line is the break-even point.
          </p>
        </>
      )}

      <div className={`sensitivity__rows${embedded ? ' sensitivity__rows--cards' : ''}`}>
        {drivers.map((row) => {
          const curPos = pos(row, row.current);
          const bePos = row.breakEven != null ? pos(row, row.breakEven) : null;
          // Safe zone fill: high-is-safe fills from break-even up; low-is-safe
          // fills from break-even down.
          const safeStart = bePos == null ? 0 : row.safeSide === 'high' ? bePos : 0;
          const safeEnd = bePos == null ? 100 : row.safeSide === 'high' ? 100 : bePos;
          const trackSafe = bePos == null && row.tone === 'safe';
          const trackRisk = bePos == null && row.tone === 'risk';

          return (
            <div className="sensitivity__row" key={row.key}>
              <div className="sensitivity__head">
                <span className="sensitivity__label">
                  {row.icon} {row.label}
                </span>
                <span className="sensitivity__current">
                  now {row.format(row.current)}
                  {row.breakEven != null && (
                    <span className="sensitivity__be"> · break-even {row.format(row.breakEven)}</span>
                  )}
                </span>
              </div>

              <div
                className={`sensitivity__track${trackSafe ? ' sensitivity__track--all-safe' : ''}${trackRisk ? ' sensitivity__track--all-risk' : ''}`}
              >
                {bePos != null && (
                  <span
                    className="sensitivity__safe"
                    style={{ left: `${safeStart}%`, width: `${Math.max(0, safeEnd - safeStart)}%` }}
                  />
                )}
                {bePos != null && (
                  <span className="sensitivity__breakeven" style={{ left: `${bePos}%` }} title="Break-even" />
                )}
                <span
                  className={`sensitivity__pin sensitivity__pin--${row.tone}`}
                  style={{ left: `${curPos}%` }}
                  title={`Current: ${row.format(row.current)}`}
                />
              </div>

              <p className={`sensitivity__cushion sensitivity__cushion--${row.tone}`}>{row.cushion}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
