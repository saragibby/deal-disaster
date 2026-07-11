import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export interface TermDefinition {
  term: string;
  definition: string;
  formula?: string;
  whyReserve?: string;
  note?: string;
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
      'The estimated average nightly price your property could command as a short-term rental on platforms like Airbnb, VRBO, or Furnished Finder.',
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
  seasonality: {
    term: 'Monthly Revenue Seasonality',
    definition:
      'How short-term rental income varies month to month. Summer months typically earn 15–20% more than annual average, while winter months may dip 20–30%. Understanding seasonality helps you budget for slower months and maximize pricing during peak demand.',
  },
  'revenue range': {
    term: 'Revenue Range',
    definition:
      'The estimated low-to-high range of gross monthly revenue based on market percentiles. The low end represents conservative bookings (25th percentile), mid is the most likely outcome (50th), and high is strong performance (75th). A wider range indicates more market variability.',
    formula: 'Based on comparable listing performance in the area',
  },
  'active listings': {
    term: 'Active Listings',
    definition:
      'The number of short-term rental listings currently active in the area. More listings mean more competition, which can pressure nightly rates and occupancy. Fewer listings in a high-demand area may signal opportunity.',
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
  'hoa': {
    term: 'HOA Fees (Homeowners Association)',
    definition:
      'Monthly fees charged by a homeowners association for shared amenities and maintenance (landscaping, pool, exterior upkeep, etc). Common for condos, townhomes, and planned communities.',
    note: 'The Zillow listing often shows HOA fees — check the listing and set the amount here for accurate cash flow.',
  },
  'comps nearby': {
    term: 'Comparable Properties Nearby',
    definition:
      'The number of similar properties found near the subject property used to estimate rent and value. More comps (10+) means higher confidence in the estimates; fewer means limited data and wider uncertainty.',
  },
  'furnished premium': {
    term: 'Furnished Premium',
    definition:
      'The multiplier applied to unfurnished long-term rent to estimate furnished mid-term rental rates. Typically 1.2–1.5× depending on bedroom count and market.',
    formula: 'MTR Monthly Rate = LTR Rent × Furnished Premium Multiplier',
  },
  'mtr demand score': {
    term: 'MTR Demand Score',
    definition:
      'A composite score (0–100) indicating how suitable a property is for mid-term rentals based on bedroom count and property type. Higher scores suggest stronger demand from traveling nurses, corporate relocations, and insurance claims.',
  },
  'turnover costs': {
    term: 'Turnover Costs',
    definition:
      'Monthly amortized cost of tenant transitions including cleaning, restocking supplies, and vacancy gaps between mid-term tenants.',
    formula: 'Annual Turnover Expense ÷ 12',
  },

  // ── LTR (Long-Term Rental) financial terms ──

  'break-even occupancy': {
    term: 'Break-even Occupancy',
    definition:
      'The minimum occupancy rate needed to cover all expenses. Lower is safer — it means you can absorb more vacancy before losing money.',
  },
  'cash-on-cash': {
    term: 'Cash-on-Cash ROI',
    definition:
      'Annual cash flow divided by your total cash invested (down payment + closing costs). Measures the return on your actual out-of-pocket investment.',
    note: 'A CoC ROI of 8% means for every $100 you invested, you earn $8/year in cash flow. Most investors target 8-12%.',
  },
  'cash flow': {
    term: 'Cash Flow',
    definition:
      'The money left over each month after all expenses are paid — your actual take-home profit from the property.',
  },
  'cost segregation': {
    term: 'Cost Segregation',
    definition:
      'A tax strategy that accelerates depreciation deductions by reclassifying building components into shorter recovery periods.',
    note: 'Instead of depreciating the full property over 27.5 years, cost segregation lets you write off 15-30% in Year 1 through bonus depreciation.',
  },
  'down payment': {
    term: 'Down Payment',
    definition:
      'The upfront cash portion of the purchase price. Investment properties typically require 20-25% down.',
  },
  'effective first-year return': {
    term: 'Effective First-Year Return',
    definition:
      'Your total first-year benefit (cash flow + tax savings) as a percentage of cash invested. Shows the true Year 1 return including tax advantages.',
  },
  'gross rent multiplier': {
    term: 'Gross Rent Multiplier',
    definition:
      'Purchase price divided by annual rent. A quick way to compare property values — lower is generally better.',
    note: 'A GRM under 10 is considered strong. Over 15 suggests the property may be overpriced relative to its rental income.',
  },
  'interest rate': {
    term: 'Interest Rate',
    definition:
      'The annual rate charged on your mortgage loan. Even small rate changes significantly impact monthly payments and long-term costs.',
  },
  insurance: {
    term: 'Insurance',
    definition:
      'Annual property insurance premium covering damage, liability, and loss of rental income. Required by most lenders.',
  },
  'loan term': {
    term: 'Loan Term',
    definition:
      'The length of your mortgage in years. 30-year terms have lower monthly payments but more total interest than 15-year terms.',
  },
  management: {
    term: 'Management',
    definition:
      'Monthly fee paid to a property manager, typically 8-12% of gross rent. Covers tenant placement, maintenance coordination, and rent collection.',
  },
  mortgage: {
    term: 'Mortgage',
    definition:
      'Your monthly principal and interest payment on the loan. This is typically the largest single expense for a rental property.',
  },
  'property tax': {
    term: 'Property Tax',
    definition:
      'Annual tax assessed by the local government based on the property\'s assessed value. Varies significantly by location.',
  },
  'safety margin': {
    term: 'Safety Margin',
    definition:
      'The gap between your current occupancy and break-even occupancy. A larger margin means more room for unexpected vacancy.',
  },
  'tax savings': {
    term: 'Tax Savings',
    definition:
      'The dollar amount saved on income taxes through depreciation deductions. Reduces your effective tax burden from rental income.',
  },
  'total cash invested': {
    term: 'Total Cash Invested',
    definition:
      'Your down payment plus estimated closing costs (~3% of purchase price). This is the total cash you need to close the deal.',
  },
  'confidence high': {
    term: 'High Confidence',
    definition:
      'This estimate is backed by 3+ rental comps or property-level market data from a verified source like RentCast or AirDNA. It closely reflects real market conditions.',
  },
  'confidence medium': {
    term: 'Medium Confidence',
    definition:
      'This estimate is supported by 1-2 rental comps or ZIP-level market data. It\'s a reasonable estimate but may vary from actual rents in your specific location.',
  },
  'confidence low': {
    term: 'Low Confidence',
    definition:
      'This estimate is algorithmically generated without external market data. Treat it as a rough guide — actual rents could differ significantly. Adding API keys (RentCast, AirDNA) or searching in markets with better data coverage will improve accuracy.',
  },
  'equity break-even': {
    term: 'Equity Break-Even',
    definition:
      'The year your total wealth from the property — cumulative cash flow + principal paydown + appreciation — equals the cash you put in. This is unrealized, on-paper equity, not cash in hand.',
    formula: 'Cumulative Cash Flow + Principal Paydown + Appreciation ≥ Total Cash Invested',
    note: 'This is net worth, not liquidity. Reaching it relies heavily on the appreciation assumption, only converts to cash if you sell (minus selling costs and taxes), and — if cash flow is negative — you keep feeding the property money the whole way there.',
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
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    if (!tooltipRef.current || !triggerRef.current) return;
    const node = tooltipRef.current;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipHeight = node.offsetHeight;
    node.style.top = `${triggerRect.top - tooltipHeight - 10}px`;
    node.style.left = `${triggerRect.left + triggerRect.width / 2 - 150}px`;
    node.style.opacity = '1';
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
          tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="term-explainer" ref={triggerRef}>
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

      {open && createPortal(
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: -9999,
            left: -9999,
            opacity: 0,
            zIndex: 10000,
            width: 300,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
            textTransform: 'none' as const,
            letterSpacing: 'normal',
            textAlign: 'left' as const,
          }}
        >
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>{info.term}</div>
          <p style={{ fontSize: '0.78rem', lineHeight: 1.5, color: '#334155', margin: 0 }}>{info.definition}</p>
          {info.note && (
            <p style={{ fontSize: '0.78rem', lineHeight: 1.5, color: '#334155', margin: '6px 0 0', fontStyle: 'italic' }}>{info.note}</p>
          )}
          {info.formula && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#64748b' }}>
              <span style={{ fontWeight: 600 }}>Formula:</span>{' '}
              <code>{info.formula}</code>
            </div>
          )}
          {info.whyReserve && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#64748b' }}>
              <span style={{ fontWeight: 600 }}>Why set money aside:</span>{' '}
              {info.whyReserve}
            </div>
          )}
          {/* Pointer arrow */}
          <div style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            marginLeft: -6,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #ffffff',
            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.06))',
          }} />
        </div>,
        document.body,
      )}
    </div>
  );
}
