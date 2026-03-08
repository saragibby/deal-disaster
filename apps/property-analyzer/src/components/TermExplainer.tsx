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
  'nightly rate': {
    term: 'Nightly Rate',
    definition:
      'The estimated average nightly price your property could command as a short-term rental on platforms like Airbnb or VRBO.',
    formula: 'Based on comparable listings in the area, adjusted for bedrooms, location, and amenities.',
  },
  occupancy: {
    term: 'Occupancy Rate',
    definition:
      'The percentage of nights per month the property is expected to be booked. Higher occupancy means more consistent income, but very high rates may signal the nightly price is too low.',
    formula: 'Occupied Nights ÷ Available Nights × 100',
  },
  'gross / mo': {
    term: 'Gross Monthly Revenue',
    definition:
      'Total income before any expenses are deducted — this is the nightly rate multiplied by the number of booked nights per month.',
    formula: 'Nightly Rate × Occupancy Rate × 30',
  },
  'net / mo': {
    term: 'Net Monthly Revenue',
    definition:
      'Your take-home short-term rental income after subtracting cleaning costs and platform fees. This is the number to compare against long-term rent.',
    formula: 'Gross Revenue − Cleaning Costs − Platform Fees',
  },
  'median sold price': {
    term: 'Median Sold Price',
    definition:
      'The middle sale price of recently sold homes in the zip code. An upward trend signals appreciation; a downward trend may indicate softening demand.',
  },
  'median list price': {
    term: 'Median List Price',
    definition:
      'The middle asking price of homes currently on the market in this zip code. Compare to median sold price to gauge how aggressive sellers are pricing.',
  },
  'days on market': {
    term: 'Days on Market (DOM)',
    definition:
      'The average number of days homes sit listed before going under contract. Lower DOM means a faster, more competitive market — which can support stronger rents.',
  },
  'sales-list price': {
    term: 'Sales-to-List Price Ratio',
    definition:
      'The percentage of the asking price that homes actually sell for. Above 100% means bidding wars; below 100% means buyers have negotiating power.',
    formula: 'Median Sale Price ÷ Median List Price × 100',
  },
  'price-to-rent': {
    term: 'Price-to-Rent Ratio',
    definition:
      'How many years of rent it would take to equal the purchase price. Lower ratios (under 15) favor buying to rent; higher ratios (over 20) suggest renting is cheaper for tenants, making it harder to find quality tenants willing to pay premium rent.',
    formula: 'Purchase Price ÷ Annual Rent',
  },
  'gross yield': {
    term: 'Gross Yield',
    definition:
      'Annual rental income as a percentage of the property price — a quick snapshot of return before expenses. Yields above 8% are generally considered strong for residential rentals.',
    formula: '(Annual Rent ÷ Purchase Price) × 100',
  },
  'rent vs area': {
    term: 'Rent vs Area Average',
    definition:
      'How your estimated rent compares to the average rent of comparable properties nearby. Positive means you can charge above market; negative means you may need to price competitively.',
    formula: '(Your Rent − Average Comp Rent) ÷ Average Comp Rent × 100',
  },
  'rent / sq ft': {
    term: 'Rent per Square Foot',
    definition:
      'Monthly rent divided by livable square footage. This normalizes rent across different-sized properties and is a key metric landlords and appraisers use to compare rental value.',
    formula: 'Monthly Rent ÷ Square Footage',
  },
  'comps nearby': {
    term: 'Comparable Properties Nearby',
    definition:
      'The number of similar properties found near the subject property used to estimate rent and value. More comps (10+) means higher confidence in the estimates; fewer means limited data and wider uncertainty.',
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
