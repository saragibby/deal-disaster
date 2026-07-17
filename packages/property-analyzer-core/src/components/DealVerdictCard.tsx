import { useState } from 'react';
import type { DealVerdict } from '@deal-platform/shared-types';
import { CheckCircle2, AlertTriangle, ShieldAlert, Minus, MessageCircleQuestion, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  verdict: DealVerdict;
  /** Property address, used to frame the AskWill explanation request. */
  address?: string;
  allowAskWill?: boolean;
}

const RATING_META: Record<DealVerdict['rating'], { label: string; icon: React.ReactNode }> = {
  strong: { label: 'Strong Deal', icon: <CheckCircle2 size={28} /> },
  marginal: { label: 'Marginal Deal', icon: <AlertTriangle size={28} /> },
  caution: { label: 'Proceed With Caution', icon: <ShieldAlert size={28} /> },
};

function ReasonIcon({ impact }: { impact: 'positive' | 'neutral' | 'negative' }) {
  if (impact === 'positive') return <CheckCircle2 size={16} className="deal-verdict__reason-icon deal-verdict__reason-icon--positive" />;
  if (impact === 'negative') return <AlertTriangle size={16} className="deal-verdict__reason-icon deal-verdict__reason-icon--negative" />;
  return <Minus size={16} className="deal-verdict__reason-icon deal-verdict__reason-icon--neutral" />;
}

export default function DealVerdictCard({ verdict, address, allowAskWill = true }: Props) {
  const meta = RATING_META[verdict.rating];
  const [expanded, setExpanded] = useState(true);

  const askWill = () => {
    const question = address
      ? `Explain the deal verdict for ${address}. It's rated "${meta.label}" (score ${verdict.score}/100). What's driving that and what should I watch out for?`
      : `Explain this deal verdict, rated "${meta.label}" (score ${verdict.score}/100). What's driving the rating and what should I watch out for?`;
    window.dispatchEvent(new CustomEvent('askwill:ask', { detail: { question } }));
  };

  return (
    <div className={`deal-verdict deal-verdict--${verdict.rating}`}>
      <div className="deal-verdict__header">
        <div className="deal-verdict__badge">
          <span className="deal-verdict__icon">{meta.icon}</span>
          <div className="deal-verdict__badge-text">
            <span className="deal-verdict__rating">{meta.label}</span>
            <span className="deal-verdict__score">Deal score {verdict.score}/100</span>
          </div>
        </div>
        <div className="deal-verdict__header-actions no-print">
          {allowAskWill && (
            <button type="button" className="deal-verdict__ask" onClick={askWill}>
              <MessageCircleQuestion size={15} />
              Ask Will to explain this verdict
            </button>
          )}
          <button
            type="button"
            className="deal-verdict__toggle"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            title={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <p className="deal-verdict__headline">{verdict.headline}</p>

          {verdict.reasons.length > 0 && (
            <ul className="deal-verdict__reasons">
              {verdict.reasons.map((r) => (
                <li key={r.code} className={`deal-verdict__reason deal-verdict__reason--${r.impact}`}>
                  <ReasonIcon impact={r.impact} />
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="deal-verdict__disclaimer">
            Rules-based summary of the numbers below — not financial advice. Adjust the assumptions to see
            how the verdict changes.
          </p>
        </>
      )}
    </div>
  );
}
