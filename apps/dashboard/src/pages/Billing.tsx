import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, useAuth } from '@deal-platform/shared-auth';
import type {
  AnalysisUsageHistory,
  AnalysisUsageRecord,
  AnalysisUsageSummary,
  CreditPackageId,
  CreditPackageList,
  CreditTransaction,
  CreditTransactionType,
} from '@deal-platform/shared-types';
import { ArrowLeft, CalendarClock, CheckCircle2, CreditCard, Gauge, Globe, Loader2, Wallet, XCircle } from 'lucide-react';
import './Billing.css';

const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
const plural = (count: number, word: string, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

const TRANSACTION_LABELS: Record<CreditTransactionType, string> = {
  purchase: 'Credit purchase',
  admin_grant: 'Credit grant',
  usage: 'Analysis',
  usage_refund: 'Refund',
  expiration: 'Expired credit',
  stripe_refund: 'Purchase refunded',
};

const REFUND_REASONS: Record<string, string> = {
  failed: 'Analysis failed — not charged',
  stale: 'Analysis didn\'t finish — not charged',
  'duplicate-property-today': 'Already analyzed today — not charged',
};

function formatDateTime(iso: string, timezone?: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function formatTime(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' })
      .format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function availableTimezones(current: string): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  const zones = intl.supportedValuesOf?.('timeZone') ?? [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function chargeLabel(record: AnalysisUsageRecord) {
  if (record.status === 'refunded') return REFUND_REASONS[record.refundReason ?? 'failed'] ?? 'Not charged';
  if (record.chargeType === 'credit') return `${money(record.amountCents)} credit`;
  if (record.chargeType === 'exempt') return 'Unlimited (admin)';
  return 'Free daily analysis';
}

type CheckoutBanner = { kind: 'pending' | 'success' | 'cancelled' | 'error'; message: string } | null;

export default function Billing() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<AnalysisUsageSummary | null>(null);
  const [history, setHistory] = useState<AnalysisUsageHistory | null>(null);
  const [packages, setPackages] = useState<CreditPackageList | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadError, setLoadError] = useState('');
  const [purchasing, setPurchasing] = useState<CreditPackageId | null>(null);
  const [purchaseError, setPurchaseError] = useState('');
  const [banner, setBanner] = useState<CheckoutBanner>(null);
  const [timezone, setTimezone] = useState('');
  const [timezoneStatus, setTimezoneStatus] = useState<{ kind: 'saved' | 'error'; message: string } | null>(null);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const mountedRef = useRef(true);
  const handledCheckoutRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [nextSummary, nextHistory, nextPackages, nextTransactions] = await Promise.all([
        api.getBillingSummary(),
        api.getUsageHistory(30),
        api.getCreditPackages(),
        api.getCreditTransactions(),
      ]);
      setSummary(nextSummary);
      setTimezone(current => current || nextSummary.timezone);
      setHistory(nextHistory);
      setPackages(nextPackages);
      setTransactions(nextTransactions.items);
      setNextCursor(nextTransactions.nextCursor);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load billing information.');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadAll();
  }, [authLoading, isAuthenticated, loadAll, navigate]);

  // Handle the redirect back from Stripe Checkout.
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout || authLoading || !isAuthenticated) return;
    const sessionId = searchParams.get('session_id');
    const checkoutKey = `${checkout}:${sessionId ?? ''}`;
    if (handledCheckoutRef.current === checkoutKey) return;
    handledCheckoutRef.current = checkoutKey;
    setSearchParams({}, { replace: true });

    if (checkout === 'cancelled') {
      setBanner({ kind: 'cancelled', message: 'Checkout was cancelled — you haven\'t been charged.' });
      return;
    }
    if (checkout !== 'success' || !sessionId) return;

    // Clearing the query string re-runs this effect, so polling is tied to mount, not to this run.
    const cancelled = () => !mountedRef.current;
    setBanner({ kind: 'pending', message: 'Confirming your payment…' });
    (async () => {
      for (let attempt = 0; attempt < 15 && !cancelled(); attempt++) {
        try {
          const status = await api.getCheckoutStatus(sessionId);
          if (cancelled()) return;
          if (status.status === 'credited') {
            setBanner({
              kind: 'success',
              message: `Payment received — ${status.creditCents ? money(status.creditCents) : 'your'} credit has been added to your account.`,
            });
            loadAll();
            return;
          }
          if (status.status === 'failed' || status.status === 'expired') {
            setBanner({ kind: 'error', message: 'We couldn\'t complete that payment. You haven\'t been charged.' });
            return;
          }
        } catch {
          // Keep polling; the webhook may still be on its way.
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!cancelled()) {
        setBanner({
          kind: 'pending',
          message: 'Your payment is still processing. Credits will appear here as soon as it clears.',
        });
      }
    })();
  }, [authLoading, isAuthenticated, loadAll, searchParams, setSearchParams]);

  const handlePurchase = async (packageId: CreditPackageId) => {
    setPurchasing(packageId);
    setPurchaseError('');
    try {
      const session = await api.createCreditCheckout(packageId);
      window.location.assign(session.url);
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setPurchasing(null);
    }
  };

  const loadMoreTransactions = async () => {
    if (!nextCursor) return;
    try {
      const page = await api.getCreditTransactions(nextCursor);
      setTransactions(current => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load more transactions.');
    }
  };

  const saveTimezone = async () => {
    setSavingTimezone(true);
    setTimezoneStatus(null);
    try {
      await api.updateBillingTimezone(timezone);
      setTimezoneStatus({ kind: 'saved', message: 'Saved. Your daily limit now resets at midnight in this timezone.' });
      setSummary(await api.getBillingSummary());
    } catch (err) {
      setTimezoneStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Unable to save timezone.' });
    } finally {
      setSavingTimezone(false);
    }
  };

  const timezones = useMemo(() => (summary ? availableTimezones(summary.timezone) : []), [summary]);
  const chartPeak = useMemo(
    () => Math.max(1, ...(history?.days ?? []).map(day => day.free + day.paid + day.exempt)),
    [history],
  );

  if (authLoading) return null;

  return (
    <div className="billing-page">
      <Link to="/profile" className="billing-page__back"><ArrowLeft size={16} /> Back to profile</Link>
      <h1 className="page-title">Billing &amp; Usage</h1>
      <p className="page-subtitle">Track your Property Analyzer usage and manage analysis credits.</p>

      {banner && (
        <div className={`billing-banner billing-banner--${banner.kind}`} role="status">
          {banner.kind === 'pending' && <Loader2 size={18} className="billing-spin" />}
          {banner.kind === 'success' && <CheckCircle2 size={18} />}
          {(banner.kind === 'cancelled' || banner.kind === 'error') && <XCircle size={18} />}
          <span>{banner.message}</span>
        </div>
      )}
      {loadError && <div className="billing-banner billing-banner--error">{loadError}</div>}

      {summary && (
        <>
          {summary.exempt && (
            <div className="billing-banner billing-banner--info">Admin accounts have unlimited analyses and are never charged.</div>
          )}
          <div className="billing-cards">
            <div className="billing-card" data-testid="billing-today">
              <Gauge size={22} />
              <div>
                <span className="billing-card__label">Analyses today</span>
                <span className="billing-card__value">{summary.today.used}</span>
                <span className="billing-card__meta">
                  {summary.today.freeRemaining} of {summary.today.freeLimit} free left
                  {summary.today.paidRuns > 0 && ` · ${plural(summary.today.paidRuns, 'paid analysis', 'paid analyses')}`}
                </span>
              </div>
            </div>
            <div className="billing-card" data-testid="billing-balance">
              <Wallet size={22} />
              <div>
                <span className="billing-card__label">Credit balance</span>
                <span className="billing-card__value">{money(summary.credits.balanceCents)}</span>
                <span className="billing-card__meta">
                  ≈ {plural(summary.credits.runsAvailable, 'analysis', 'analyses')} at {money(summary.pricePerRunCents)} each
                </span>
              </div>
            </div>
            <div className="billing-card">
              <CalendarClock size={22} />
              <div>
                <span className="billing-card__label">Free analyses reset</span>
                <span className="billing-card__value billing-card__value--sm">{formatTime(summary.today.resetsAt, summary.timezone)}</span>
                <span className="billing-card__meta">
                  {summary.credits.nextExpiration
                    ? `${money(summary.credits.nextExpiration.cents)} credit expires ${formatDateTime(summary.credits.nextExpiration.expiresAt, summary.timezone)}`
                    : summary.timezone}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {packages && (
        <section className="billing-section">
          <h2 className="section-title"><CreditCard size={20} /> Buy credits</h2>
          <p className="billing-section__intro">
            You get {summary ? plural(summary.today.freeLimit, 'free analysis', 'free analyses') : 'free analyses'} every day.
            After that, each new analysis or re-analysis uses {money(packages.pricePerRunCents)} of credit. Viewing
            saved analyses and adjusting their assumptions is always free, and a property you&apos;ve already analyzed
            today can be re-analyzed again at no extra cost.
          </p>
          {!packages.purchasesEnabled && (
            <div className="billing-banner billing-banner--info">Credit purchases aren&apos;t available yet. Please check back soon.</div>
          )}
          <div className="billing-packages">
            {packages.packages.map(pkg => (
              <div key={pkg.id} className="billing-package">
                <span className="billing-package__name">{pkg.label}</span>
                <span className="billing-package__price">{money(pkg.priceCents)}</span>
                <span className="billing-package__runs">{plural(pkg.runs, 'analysis', 'analyses')}</span>
                <button
                  type="button"
                  className="btn btn--primary btn--full"
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={!packages.purchasesEnabled || purchasing !== null}
                >
                  {purchasing === pkg.id ? <Loader2 size={16} className="billing-spin" /> : `Buy ${money(pkg.priceCents)}`}
                </button>
              </div>
            ))}
          </div>
          {purchaseError && <div className="billing-banner billing-banner--error">{purchaseError}</div>}
          <p className="billing-section__fine-print">
            Payments are processed securely by Stripe. Credits expire {packages.creditExpiryMonths} months after purchase
            and are non-refundable. Analyses that fail are never charged.
          </p>
        </section>
      )}

      {history && (
        <section className="billing-section">
          <h2 className="section-title"><Gauge size={20} /> Usage — last 30 days</h2>
          <div className="billing-chart" role="img" aria-label="Analyses per day for the last 30 days">
            {history.days.map(day => {
              const total = day.free + day.paid + day.exempt;
              return (
                <div key={day.date} className="billing-chart__col" title={`${formatDay(day.date)}: ${total} (${day.free} free, ${day.paid} paid)`}>
                  <div className="billing-chart__track">
                    <div className="billing-chart__bar billing-chart__bar--paid" style={{ height: `${(day.paid / chartPeak) * 100}%` }} />
                    <div className="billing-chart__bar billing-chart__bar--free" style={{ height: `${((day.free + day.exempt) / chartPeak) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="billing-chart__legend">
            <span className="billing-chart__legend--free">Free</span>
            <span className="billing-chart__legend--paid">Paid with credit</span>
          </div>

          <h3 className="billing-subtitle">Recent analyses</h3>
          {history.recent.length === 0 ? (
            <p className="billing-empty">No analyses yet.</p>
          ) : (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr><th>Date</th><th>Property</th><th>Charge</th></tr>
                </thead>
                <tbody>
                  {history.recent.map(record => (
                    <tr key={record.id} className={record.status === 'refunded' ? 'billing-table__row--muted' : undefined}>
                      <td>{formatDateTime(record.createdAt, summary?.timezone)}</td>
                      <td>{record.propertyAddress ?? '—'}</td>
                      <td>{chargeLabel(record)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {summary && (
        <section className="billing-section">
          <h2 className="section-title"><Wallet size={20} /> Credit history</h2>
          {transactions.length === 0 ? (
            <p className="billing-empty">No credit activity yet.</p>
          ) : (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr><th>Date</th><th>Activity</th><th className="billing-table__amount">Amount</th></tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr key={tx.id}>
                      <td>{formatDateTime(tx.createdAt, summary.timezone)}</td>
                      <td>
                        {tx.description ?? TRANSACTION_LABELS[tx.type]}
                        {tx.expiresAt && <span className="billing-table__note">Expires {formatDateTime(tx.expiresAt, summary.timezone)}</span>}
                      </td>
                      <td className={`billing-table__amount ${tx.amountCents >= 0 ? 'billing-table__amount--credit' : ''}`}>
                        {tx.amountCents >= 0 ? '+' : ''}{money(tx.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nextCursor && (
            <button type="button" className="btn btn--outline billing-load-more" onClick={loadMoreTransactions}>Load more</button>
          )}
        </section>
      )}

      {summary && (
        <section className="billing-section">
          <h2 className="section-title"><Globe size={20} /> Daily reset timezone</h2>
          <p className="billing-section__intro">Your free analyses reset at midnight in this timezone. You can change it once every 24 hours.</p>
          <div className="billing-timezone">
            <select value={timezone} onChange={event => setTimezone(event.target.value)} aria-label="Timezone">
              {timezones.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
            </select>
            <button
              type="button"
              className="btn btn--primary"
              onClick={saveTimezone}
              disabled={savingTimezone || timezone === summary.timezone}
            >
              {savingTimezone ? 'Saving…' : 'Save'}
            </button>
          </div>
          {timezoneStatus && (
            <div className={`billing-banner billing-banner--${timezoneStatus.kind === 'saved' ? 'success' : 'error'}`}>{timezoneStatus.message}</div>
          )}
        </section>
      )}
    </div>
  );
}
