import type { AnalysisUsageSummary } from '@deal-platform/shared-types';
import { Gauge } from 'lucide-react';

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatResetTime(resetsAt: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' })
      .format(new Date(resetsAt));
  } catch {
    return new Date(resetsAt).toLocaleTimeString();
  }
}

interface UsageMeterProps {
  usage: AnalysisUsageSummary;
  onBuyCredits(): void;
}

export default function UsageMeter({ usage, onBuyCredits }: UsageMeterProps) {
  const { freeRemaining, freeLimit } = usage.today;
  const { balanceCents, runsAvailable } = usage.credits;
  const blocked = usage.nextRunChargeCents < 0;

  let status: string;
  if (freeRemaining > 0) {
    status = `${freeRemaining} of ${freeLimit} free ${freeLimit === 1 ? 'analysis' : 'analyses'} left today`;
  } else if (blocked) {
    status = `Daily limit reached · resets at ${formatResetTime(usage.today.resetsAt, usage.timezone)}`;
  } else {
    status = `Free analyses used for today · next analysis uses ${formatCents(usage.nextRunChargeCents)} of credit`;
  }

  return (
    <div className={`usage-meter${blocked ? ' usage-meter--blocked' : ''}`} data-testid="usage-meter">
      <Gauge size={16} />
      <span className="usage-meter__status">{status}</span>
      {balanceCents > 0 && (
        <span className="usage-meter__credits">
          {formatCents(balanceCents)} credit (≈{runsAvailable} {runsAvailable === 1 ? 'analysis' : 'analyses'})
        </span>
      )}
      <button type="button" className="usage-meter__buy" onClick={onBuyCredits}>
        {balanceCents > 0 ? 'Add credits' : 'Buy credits'}
      </button>
    </div>
  );
}
