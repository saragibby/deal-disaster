import type { ReactNode } from 'react';
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
  /** Extra controls shown at the end of the meter row (e.g. Cancel). */
  children?: ReactNode;
}

export default function UsageMeter({ usage, onBuyCredits, children }: UsageMeterProps) {
  const { freeRemaining, freeLimit } = usage.today;
  const { runsAvailable } = usage.credits;
  const blocked = usage.nextRunChargeCents < 0;

  let status: string;
  if (freeRemaining > 0) {
    status = `${freeRemaining} of ${freeLimit} free ${freeLimit === 1 ? 'analysis' : 'analyses'} left today`;
  } else if (runsAvailable > 0) {
    status = `Free analyses used for today. You have credits for ${runsAvailable} more ${runsAvailable === 1 ? 'analysis' : 'analyses'}.`;
  } else {
    status = 'Free analyses used for today. Add credits or come back tomorrow.';
  }

  return (
    <div className={`usage-meter${blocked ? ' usage-meter--blocked' : ''}`} data-testid="usage-meter">
      <Gauge size={16} />
      <span className="usage-meter__status">{status}</span>
      <button type="button" className="usage-meter__buy" onClick={onBuyCredits}>
        Add credits
      </button>
      {children}
    </div>
  );
}
