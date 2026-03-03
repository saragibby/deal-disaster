import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

export interface TermDefinition {
  term: string;
  definition: string;
  formula?: string;
  whyReserve?: string;
}

/** Lookup of all term explanations, keyed by keyword found in label text */
export const TERM_EXPLAINERS: Record<string, TermDefinition> = {
  capex: {
    term: 'CapEx (Capital Expenditures)',
    definition:
      'Major, infrequent property expenses that extend the property\'s life or value (like a new roof, HVAC, etc).',
    whyReserve:
      'These costs are inevitable and expensive. Saving a portion of rental income each month prevents large surprise bills from hurting your cash flow.',
  },
  vacancy: {
    term: 'Vacancy',
    definition:
      'The period when your rental property is not occupied and producing no rent.',
    whyReserve:
      'Even great properties sit empty sometimes. Setting aside part of your rental income ensures you can still cover the mortgage and expenses during gaps between tenants.',
  },
  repairs: {
    term: 'Repairs',
    definition:
      'Routine or unexpected fixes needed to keep the property functional (like plumbing leaks, appliance fixes, or minor maintenance).',
    whyReserve:
      'Small issues happen regularly. A repair reserve keeps normal wear and tear from eating into your monthly cash flow.',
  },
  'cap rate': {
    term: 'Cap Rate (Capitalization Rate)',
    definition:
      'A metric used to evaluate a property\'s return based on its net income.',
    formula: 'Cap Rate = Net Operating Income (NOI) ÷ Property Value',
  },
};

/**
 * Given a label string, returns a matching TermDefinition or undefined.
 */
export function findExplainer(label: string): TermDefinition | undefined {
  const lower = label.toLowerCase();
  // Order matters: check longer keys first to avoid partial matches
  for (const key of Object.keys(TERM_EXPLAINERS).sort((a, b) => b.length - a.length)) {
    if (lower.includes(key)) {
      return TERM_EXPLAINERS[key];
    }
  }
  return undefined;
}

/**
 * A small info-icon button. On click it opens an expanded tooltip card
 * with the term's definition.
 */
export default function TermExplainer({ info }: { info: TermDefinition }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="term-explainer" ref={ref}>
      <button
        type="button"
        className="term-explainer__btn"
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        aria-label={`What is ${info.term}?`}
        title={`What is ${info.term}?`}
      >
        <Info size={14} />
      </button>

      {open && (
        <div className="term-explainer__tooltip">
          <div className="term-explainer__header">{info.term}</div>
          <p className="term-explainer__body">{info.definition}</p>
          {info.formula && (
            <div className="term-explainer__formula">
              <span className="term-explainer__formula-label">Formula:</span>{' '}
              <code>{info.formula}</code>
            </div>
          )}
          {info.whyReserve && (
            <div className="term-explainer__why">
              <span className="term-explainer__why-label">Why set money aside:</span>{' '}
              {info.whyReserve}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
