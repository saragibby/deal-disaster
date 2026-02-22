-- Migration: Add resources and tools tables
-- These are admin-managed content types displayed on the dashboard portal.

CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  content TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'article',
  url VARCHAR(500),
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resources_sort ON resources(sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);

CREATE TABLE IF NOT EXISTS tools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  content TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'calculator',
  url VARCHAR(500),
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  icon VARCHAR(50) NOT NULL DEFAULT '🔧',
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tools_sort ON tools(sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);

-- Seed some initial resources
INSERT INTO resources (title, description, content, type, url, category, is_premium, is_featured, sort_order) VALUES
  ('How Many Assets Hub',
   'Members-only learning platform by Will Myers with courses, deal breakdowns, and asset training for building passive income.',
   'How Many Assets is a premium membership hub from Money Man Will Myers. It features structured courses, video walkthroughs, and resources for building your passive income portfolio.\n\n## What''s Inside\n- Step-by-step courses on acquiring income-producing assets\n- Live deal breakdowns and case studies\n- Asset-specific training modules\n- Downloadable templates and checklists\n- Direct access to Will Myers'' strategies\n\n## Topics Covered\n- Foreclosure investing\n- Real estate wholesaling\n- Airbnb / short-term rentals\n- Self-storage facilities\n- RV parks\n- Ice machines & vending\n\nVisit [howmanyassets.com](https://howmanyassets.com/) to log in or learn more.',
   'external', 'https://howmanyassets.com/', 'Learning', TRUE, TRUE, 0),

  ('Passive Income Club (Skool)',
   'Join Will Myers'' private community of 350+ investors learning to build cashflowing assets — live reviews, deal breakdowns, and step-by-step training.',
   'The Passive Income Club is a private Skool community run by Money Man Will Myers. It''s designed for serious investors who want hands-on guidance building passive income streams.\n\n## What You Get\n- The first 7 steps to get your first (or next) passive income asset\n- LIVE asset reviews and deal breakdowns\n- How to find profit in any asset\n\n## Asset-Specific Training\n- Airbnb & short-term rentals\n- Real estate investing\n- RV parks\n- Ice machines & vending\n- Self-storage\n- Foreclosures\n\n## Community Benefits\n- Connect with 350+ like-minded investors\n- Share insights and support each other\n- Active, engaged community — no lurking\n\nRegister at [willsfreeclass.com/jointheclub](https://www.willsfreeclass.com/jointheclub) to join.',
   'external', 'https://www.skool.com/pic', 'Community', TRUE, TRUE, 0),

  ('Foreclosure Investing 101', 
   'Learn the basics of foreclosure investing: how auctions work, what to look for, and common pitfalls to avoid.',
   'Foreclosure investing can be highly profitable, but it requires understanding the auction process, title research, property evaluation, and risk management. This guide covers everything from finding properties to closing the deal.\n\n## What is Foreclosure Investing?\nForeclosure investing involves purchasing properties that have been seized by lenders due to the borrower''s failure to make mortgage payments. These properties are typically sold at auction, often below market value.\n\n## Key Steps\n1. Research the property title\n2. Calculate After Repair Value (ARV)\n3. Estimate repair costs\n4. Account for all liens and encumbrances\n5. Set your maximum bid\n6. Attend the auction\n\n## Common Pitfalls\n- Ignoring title issues\n- Underestimating repairs\n- Overbidding due to emotion\n- Not accounting for HOA super liens',
   'guide', NULL, 'Getting Started', FALSE, FALSE, 1),

  ('How to Analyze a Deal', 
   'Step-by-step guide to evaluating a foreclosure property including ARV calculation, repair estimates, and profit analysis.',
   'Deal analysis is the most critical skill in foreclosure investing. A thorough analysis can mean the difference between a profitable investment and a financial disaster.\n\n## The 70% Rule\nNever pay more than 70% of the After Repair Value (ARV) minus repair costs.\n\nFormula: Maximum Bid = (ARV × 0.70) - Repair Costs\n\n## Step-by-Step Analysis\n1. Determine ARV using comparable sales\n2. Get repair estimates (always add 15-20% buffer)\n3. Research all liens on the property\n4. Calculate holding costs (taxes, insurance, utilities)\n5. Factor in closing costs (both purchase and sale)\n6. Determine your profit margin\n\n## Red Flags to Watch For\n- Environmental issues\n- Foundation problems\n- Code violations\n- Occupied properties',
   'article', NULL, 'Deal Analysis', TRUE, FALSE, 2),

  ('Red Flags in Title Searches', 
   'Understanding liens, encumbrances, and title issues that can turn a deal into a disaster.',
   'Title issues are one of the most common ways investors lose money in foreclosure investing. Always conduct a thorough title search before bidding.\n\n## Types of Liens\n- **Tax Liens**: Government liens for unpaid property taxes (survive foreclosure)\n- **HOA Super Liens**: Association liens that may have priority\n- **IRS Liens**: Federal tax liens with redemption rights\n- **Mechanics Liens**: Claims from contractors for unpaid work\n\n## Title Search Checklist\n1. Check county recorder records\n2. Verify the foreclosing entity''s position\n3. Look for all recorded liens\n4. Check for pending litigation\n5. Verify property boundaries\n6. Review HOA status letter',
   'guide', NULL, 'Due Diligence', TRUE, FALSE, 3),

  ('Money Man Will Myers YouTube', 
   'Watch real foreclosure walkthroughs, deal breakdowns, and investing tips from Money Man Will Myers.',
   NULL,
   'external', 'https://moneymanmyers.com/', 'Learning', FALSE, FALSE, 4),

  ('Understanding HOA Liens', 
   'How HOA super liens can wipe out your investment and what to check before bidding at auction.',
   'HOA liens are one of the most misunderstood aspects of foreclosure investing. In many states, HOAs have "super lien" status, meaning a portion of their lien can survive foreclosure.\n\n## Key Facts\n- Super lien amount varies by state\n- Always request an HOA status letter\n- Budget for outstanding HOA dues\n- Some HOAs have extensive special assessments',
   'article', NULL, 'Due Diligence', TRUE, FALSE, 5),

  ('Renovation Cost Estimating', 
   'Learn to estimate repair costs like a pro. Covers roofing, HVAC, plumbing, electrical, and cosmetic updates.',
   'Accurate repair estimates are essential for profitable investing. Here are average costs for common repairs:\n\n## Cost Ranges (National Averages)\n- **Roof Replacement**: $8,000 - $15,000\n- **HVAC System**: $5,000 - $10,000\n- **Plumbing (repipe)**: $4,000 - $8,000\n- **Electrical Panel Upgrade**: $2,000 - $4,000\n- **Kitchen Remodel**: $15,000 - $40,000\n- **Bathroom Remodel**: $8,000 - $20,000\n- **Flooring (per sqft)**: $3 - $12\n- **Paint (interior)**: $3,000 - $6,000\n\n## Pro Tips\n- Always add 15-20% contingency\n- Get multiple contractor quotes\n- Factor in permit costs\n- Consider scope creep',
   'guide', NULL, 'Deal Analysis', TRUE, FALSE, 6)
ON CONFLICT DO NOTHING;

-- Seed some initial tools
INSERT INTO tools (name, description, content, type, url, category, icon, is_premium, sort_order) VALUES
  ('ARV Calculator', 
   'Calculate the After Repair Value of a property using comparable sales data.',
   'Use this calculator to determine the ARV of a property based on recent comparable sales in the area.\n\n## How to Use\n1. Enter the subject property details (sqft, beds, baths)\n2. Add 3-5 comparable sales\n3. Adjust for differences in features\n4. Get your estimated ARV\n\n## Formula\nARV = Average Comp Price ± Adjustments',
   'calculator', NULL, 'Deal Analysis', '🧮', FALSE, 1),

  ('Deal Analyzer Spreadsheet', 
   'Complete deal analysis spreadsheet with built-in formulas for ROI, cash-on-cash return, and profit margin.',
   'Download this comprehensive spreadsheet to analyze any foreclosure deal.\n\nIncludes:\n- Purchase price calculator\n- Repair cost estimator\n- Holding cost tracker\n- ROI calculator\n- Cash-on-cash return\n- Exit strategy comparison',
   'spreadsheet', NULL, 'Deal Analysis', '📊', TRUE, 2),

  ('Property Inspection Checklist', 
   'A comprehensive checklist to use when evaluating a foreclosure property. Never miss a critical issue.',
   '## Exterior\n- [ ] Roof condition (shingles, flashing, gutters)\n- [ ] Foundation (cracks, settling, water damage)\n- [ ] Siding and trim\n- [ ] Windows and doors\n- [ ] Landscaping and drainage\n- [ ] Driveway and walkways\n\n## Interior\n- [ ] Walls and ceilings (cracks, water stains)\n- [ ] Flooring condition\n- [ ] Kitchen appliances and cabinets\n- [ ] Bathroom fixtures and plumbing\n- [ ] Electrical panel and outlets\n- [ ] HVAC system\n\n## Systems\n- [ ] Plumbing (run all faucets, flush toilets)\n- [ ] Electrical (test outlets, check panel)\n- [ ] HVAC (heating and cooling test)\n- [ ] Water heater age and condition\n\n## Documentation\n- [ ] Title search completed\n- [ ] HOA status letter obtained\n- [ ] Tax records verified\n- [ ] Code violations checked\n- [ ] Environmental concerns assessed',
   'checklist', NULL, 'Due Diligence', '✅', FALSE, 3),

  ('Bid Strategy Template', 
   'Template to help you set your maximum bid price and stick to your strategy at auction.',
   'Use this template before every auction to set and document your maximum bid.\n\n## Pre-Auction Worksheet\n- Property Address: ___\n- Estimated ARV: $___\n- Repair Estimate: $___\n- Maximum Bid (70% rule): $___\n- Absolute Walk-Away Price: $___\n\n## Auction Notes\n- Opening bid: $___\n- Final bid: $___\n- Won/Lost: ___\n- Notes: ___',
   'template', NULL, 'Auction Strategy', '📝', TRUE, 4),

  ('Comparable Sales Finder', 
   'Guide and links to find comparable sales data for accurate property valuations.',
   'Finding accurate comparable sales is critical for determining ARV.\n\n## Free Resources\n- Zillow (recently sold)\n- Redfin (sold data)\n- County assessor records\n- MLS (via agent access)\n\n## How to Find Good Comps\n1. Same neighborhood (within 0.5 miles)\n2. Sold within last 6 months\n3. Similar size (±20% sqft)\n4. Similar features (beds, baths, garage)\n5. Similar condition (after repairs)',
   'template', NULL, 'Deal Analysis', '🔍', FALSE, 5)
ON CONFLICT DO NOTHING;
