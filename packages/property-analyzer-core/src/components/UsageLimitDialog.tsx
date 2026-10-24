import { useEffect, useRef } from 'react';
import type { AnalysisUsageSummary } from '@deal-platform/shared-types';
import { Clock, CreditCard, History, X } from 'lucide-react';
import { formatCents, formatResetTime } from './UsageMeter.js';

interface UsageLimitDialogProps {
  usage: AnalysisUsageSummary;
  onBuyCredits(): void;
  onViewHistory(): void;
  onClose(): void;
}

export default function UsageLimitDialog({ usage, onBuyCredits, onViewHistory, onClose }: UsageLimitDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const { freeLimit } = usage.today;
  const price = formatCents(usage.pricePerRunCents);
  const balance = usage.credits.balanceCents;

  return (
    <div className="usage-dialog-overlay" onClick={onClose}>
      <div
        className="usage-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-dialog-title"
        onClick={event => event.stopPropagation()}
      >
        <button type="button" className="usage-dialog__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h3 id="usage-dialog-title">You&apos;ve reached today&apos;s analysis limit</h3>
        <p className="usage-dialog__subtitle">
          You&apos;ve used all {freeLimit} free {freeLimit === 1 ? 'analysis' : 'analyses'} for today
          {balance > 0
            ? ` and your ${formatCents(balance)} credit balance doesn't cover another ${price} analysis.`
            : ' and you don\'t have any credits.'}
          {' '}Here&apos;s how to keep going:
        </p>

        <ul className="usage-dialog__options">
          <li>
            <CreditCard size={20} />
            <div>
              <strong>Buy credits</strong>
              <span>Each analysis beyond your free daily limit uses {price} of credit. Credits carry over until they&apos;re used up.</span>
            </div>
          </li>
          <li>
            <Clock size={20} />
            <div>
              <strong>Wait for your daily reset</strong>
              <span>Your {freeLimit} free {freeLimit === 1 ? 'analysis refreshes' : 'analyses refresh'} at {formatResetTime(usage.today.resetsAt, usage.timezone)}.</span>
            </div>
          </li>
          <li>
            <History size={20} />
            <div>
              <strong>Revisit saved analyses</strong>
              <span>Viewing, adjusting and re-analyzing properties you&apos;ve already analyzed is always free.</span>
            </div>
          </li>
        </ul>

        <div className="usage-dialog__actions">
          <button type="button" className="usage-dialog__secondary" onClick={onViewHistory}>
            View my analyses
          </button>
          <button type="button" className="usage-dialog__primary" onClick={onBuyCredits} ref={primaryRef}>
            Buy credits
          </button>
        </div>
      </div>
    </div>
  );
}
