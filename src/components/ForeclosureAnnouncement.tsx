import React from 'react';
import '../styles/ForeclosureAnnouncement.css';

interface AnnouncementProps {
  caseId: string;
}

// Case 1: IRS Lien Scenario
const Case001Announcement = () => (
  <div className="foreclosure-announcement">
    <div className="announcement-header">
      <div className="header-banner">NOTICE OF FORECLOSURE SALE</div>
      <div className="notice-date">Published: October 15, 2024</div>
    </div>

    <div className="announcement-content">
      <section className="property-info">
        <h2>PROPERTY DETAILS</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Address:</label>
            <span>1428 Elm Street, Phoenix, AZ 85001</span>
          </div>
          <div className="info-item">
            <label>County:</label>
            <span>Maricopa County</span>
          </div>
          <div className="info-item">
            <label>Parcel #:</label>
            <span>101-45-8023-A</span>
          </div>
          <div className="info-item">
            <label>Property Type:</label>
            <span>Single Family Residential</span>
          </div>
        </div>
      </section>

      <section className="loan-info">
        <h2>LOAN INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Original Loan Amount:</label>
            <span>$285,000</span>
          </div>
          <div className="info-item">
            <label>Current Balance:</label>
            <span>$165,000</span>
          </div>
          <div className="info-item">
            <label>Lender:</label>
            <span>Bank of America, N.A.</span>
          </div>
          <div className="info-item">
            <label>Loan Origination Date:</label>
            <span>March 12, 2015</span>
          </div>
        </div>
      </section>

      <section className="foreclosure-info">
        <h2>FORECLOSURE SALE INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Sale Date:</label>
            <span>November 28, 2024</span>
          </div>
          <div className="info-item">
            <label>Sale Time:</label>
            <span>10:00 AM MST</span>
          </div>
          <div className="info-item">
            <label>Sale Location:</label>
            <span>Maricopa County Courthouse Steps, 201 W Jefferson, Phoenix, AZ</span>
          </div>
          <div className="info-item">
            <label>Opening Bid:</label>
            <span>$180,000</span>
          </div>
        </div>
      </section>

      <section className="property-condition">
        <h2>PROPERTY CONDITION</h2>
        <p>The subject property is a 3-bedroom, 2-bathroom single-family home constructed in 1998. The property is currently vacant. Physical inspection reports indicate the property is in generally fair condition with cosmetic deterioration present. The home features a detached garage and sits on approximately 0.35 acres.</p>
        
        <h3>Notable Features:</h3>
        <ul>
          <li>Central air conditioning and heating</li>
          <li>Updated electrical panel (2019)</li>
          <li>Roof replaced 8 years ago</li>
          <li>Large backyard area with mature trees</li>
        </ul>

        <h3>Estimated Repairs/Updates:</h3>
        <ul>
          <li>Interior painting: $4,500</li>
          <li>New flooring (kitchen/bathrooms): $8,000</li>
          <li>Kitchen appliances replacement: $3,500</li>
          <li>Landscape restoration: $2,000</li>
          <li>General maintenance/cleanup: $26,000</li>
        </ul>
      </section>

      <section className="liens-encumbrances">
        <h2>LIENS & ENCUMBRANCES</h2>
        <div className="liens-table">
          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">First Mortgage (Being Foreclosed)</span>
              <span className="lien-amount">$165,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Bank of America, N.A.</p>
              <p><strong>Status:</strong> Will be paid off from sale proceeds</p>
            </div>
          </div>

          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">Second Mortgage / HELOC</span>
              <span className="lien-amount">$25,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Wells Fargo Home Equity</p>
              <p><strong>Status:</strong> Will be eliminated at foreclosure sale</p>
            </div>
          </div>

          <div className="lien-entry warning">
            <div className="lien-header">
              <span className="lien-type">⚠️ Federal Tax Lien - IRS</span>
              <span className="lien-amount">$78,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Internal Revenue Service - Revenue Officer J. Smith</p>
              <p><strong>Filing Date:</strong> June 3, 2022</p>
              <p><strong>Status:</strong> <strong>SURVIVES FORECLOSURE SALE</strong> - This lien will attach to the property and you will become responsible for this federal tax debt.</p>
              <p><strong>Reason:</strong> Federal tax liens have special superpriority status and continue against the property even after foreclosure.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="property-history">
        <h2>PROPERTY HISTORY</h2>
        <div className="history-timeline">
          <div className="history-item">
            <span className="history-date">2015</span>
            <span className="history-event">Property financed with first mortgage</span>
          </div>
          <div className="history-item">
            <span className="history-date">2019</span>
            <span className="history-event">Home Equity Line of Credit established</span>
          </div>
          <div className="history-item">
            <span className="history-date">June 2022</span>
            <span className="history-event">IRS files tax lien for unpaid income taxes</span>
          </div>
          <div className="history-item">
            <span className="history-date">March 2024</span>
            <span className="history-event">Mortgage payments become delinquent</span>
          </div>
          <div className="history-item">
            <span className="history-date">October 2024</span>
            <span className="history-event">Foreclosure notice published</span>
          </div>
        </div>
      </section>

      <section className="bidding-instructions">
        <h2>BIDDING INSTRUCTIONS</h2>
        <p><strong>Auction Type:</strong> Open Auction (Anyone may bid)</p>
        <p><strong>Cashier's Check Required:</strong> Yes - 10% of opening bid due day of sale for winning bidder</p>
        <p><strong>Balance Due:</strong> Within 24 hours of sale</p>
        <p><strong>Property Sold As-Is:</strong> No warranty or guarantees. Property is available for inspection 48 hours before sale.</p>
        <p><strong>Note:</strong> Buyer assumes all liens that survive foreclosure and all property defects and code violations.</p>
      </section>

      <section className="disclaimer">
        <p><strong>DISCLAIMER:</strong> This property is sold subject to existing liens, encumbrances, and municipal code requirements. All liens not eliminated by foreclosure sale survive and attach to the new owner. Buyer is responsible for all due diligence investigations.</p>
      </section>
    </div>
  </div>
);

// Case 2: Good Deal (Las Vegas Townhome)
const Case002Announcement = () => (
  <div className="foreclosure-announcement">
    <div className="announcement-header">
      <div className="header-banner">NOTICE OF TRUSTEE SALE</div>
      <div className="notice-date">Published: September 8, 2024</div>
    </div>

    <div className="announcement-content">
      <section className="property-info">
        <h2>PROPERTY DETAILS</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Address:</label>
            <span>742 Evergreen Terrace, Las Vegas, NV 89101</span>
          </div>
          <div className="info-item">
            <label>County:</label>
            <span>Clark County</span>
          </div>
          <div className="info-item">
            <label>Parcel #:</label>
            <span>155-23-001-456</span>
          </div>
          <div className="info-item">
            <label>Property Type:</label>
            <span>Townhome - Gated Community</span>
          </div>
        </div>
      </section>

      <section className="loan-info">
        <h2>LOAN INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Original Loan Amount:</label>
            <span>$298,000</span>
          </div>
          <div className="info-item">
            <label>Current Balance:</label>
            <span>$235,000</span>
          </div>
          <div className="info-item">
            <label>Lender:</label>
            <span>Chase Mortgage Company</span>
          </div>
          <div className="info-item">
            <label>Loan Type:</label>
            <span>30-Year Fixed</span>
          </div>
        </div>
      </section>

      <section className="foreclosure-info">
        <h2>TRUSTEE SALE INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Sale Date:</label>
            <span>October 22, 2024</span>
          </div>
          <div className="info-item">
            <label>Sale Time:</label>
            <span>2:00 PM PST</span>
          </div>
          <div className="info-item">
            <label>Sale Location:</label>
            <span>Outside main entrance of Las Vegas District Court, Regional Justice Center, Las Vegas, NV</span>
          </div>
          <div className="info-item">
            <label>Opening Bid:</label>
            <span>$140,000</span>
          </div>
        </div>
      </section>

      <section className="property-condition">
        <h2>PROPERTY CONDITION</h2>
        <p>The subject property is a 4-bedroom, 2.5-bathroom townhome located in the prestigious Evergreen Gated Community. The property is currently vacant and in good condition. Recent renovations to the kitchen have been completed. The property features an attached two-car garage and access to community amenities including pools and fitness center.</p>
        
        <h3>Recent Improvements:</h3>
        <ul>
          <li>Kitchen renovated (2023) - granite counters, stainless appliances</li>
          <li>Updated HVAC system (2022)</li>
          <li>New roof (2021)</li>
          <li>Remodeled master bathroom (2023)</li>
        </ul>

        <h3>Maintenance Items:</h3>
        <ul>
          <li>Landscape restoration and planting: $12,000</li>
          <li>Exterior paint touch-up: $3,500</li>
          <li>Interior carpet replacement: $8,000</li>
          <li>General cleaning and staging: $2,000</li>
          <li>Pool equipment inspection and repairs: $9,500</li>
        </ul>
      </section>

      <section className="liens-encumbrances">
        <h2>LIENS & ENCUMBRANCES</h2>
        <div className="liens-table">
          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">First Deed of Trust (Being Foreclosed)</span>
              <span className="lien-amount">$235,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Chase Mortgage Company</p>
              <p><strong>Status:</strong> Will be paid off from sale proceeds</p>
            </div>
          </div>

          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">HOA Assessment (Past Due)</span>
              <span className="lien-amount">$1,200</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Evergreen Homeowners Association</p>
              <p><strong>Monthly Fee:</strong> $150</p>
              <p><strong>Status:</strong> May survive depending on Nevada HOA law. Typically manageable amount.</p>
              <p><strong>Benefits:</strong> HOA provides grounds maintenance, pool, fitness center, security</p>
            </div>
          </div>
        </div>
      </section>

      <section className="hoa-information">
        <h2>HOMEOWNERS ASSOCIATION INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Association:</label>
            <span>Evergreen Homeowners Association</span>
          </div>
          <div className="info-item">
            <label>Monthly Dues:</label>
            <span>$150</span>
          </div>
          <div className="info-item">
            <label>Special Assessments:</label>
            <span>Occasional, typically $200-500 annually</span>
          </div>
          <div className="info-item">
            <label>Reserve Study Status:</label>
            <span>Current (2023) - Healthy reserves</span>
          </div>
        </div>
        
        <h3>Community Amenities:</h3>
        <ul>
          <li>Olympic-size swimming pool</li>
          <li>24-hour fitness center</li>
          <li>Community clubhouse</li>
          <li>Gated security with 24/7 patrol</li>
          <li>Manicured grounds and landscaping</li>
        </ul>
      </section>

      <section className="market-analysis">
        <h2>MARKET ANALYSIS</h2>
        <div className="analysis-box">
          <p><strong>Estimated Market Value:</strong> $245,000</p>
          <p><strong>Recent Comparable Sales:</strong> $240,000 - $255,000 (sold in last 3 months)</p>
          <p><strong>Community Appreciation:</strong> 3-4% annually over past 5 years</p>
          <p><strong>Rental Income Potential:</strong> $1,400 - $1,600/month</p>
        </div>
      </section>

      <section className="bidding-instructions">
        <h2>BIDDING INSTRUCTIONS</h2>
        <p><strong>Auction Type:</strong> Open Trustee Auction</p>
        <p><strong>Cashier's Check Required:</strong> 5% of opening bid due at sale</p>
        <p><strong>Balance Due:</strong> Within 24 hours</p>
        <p><strong>Property Condition:</strong> Sold as-is, where-is. Property available for inspection 48 hours prior to sale.</p>
      </section>

      <section className="disclaimer">
        <p><strong>DISCLAIMER:</strong> This property is sold in its current condition. The opening bid is the lender's estimate of the property's fair market value. No warranties are provided. Buyer assumes all liens not eliminated by the trustee sale.</p>
      </section>
    </div>
  </div>
);

// Case 3: HOA Superpriority Lien (Henderson Luxury Condo)
const Case003Announcement = () => (
  <div className="foreclosure-announcement">
    <div className="announcement-header">
      <div className="header-banner">NOTICE OF TRUSTEE SALE</div>
      <div className="notice-date">Published: August 20, 2024</div>
    </div>

    <div className="announcement-content">
      <section className="property-info">
        <h2>PROPERTY DETAILS</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Address:</label>
            <span>221B Baker Street, Unit 1205, Henderson, NV 89002</span>
          </div>
          <div className="info-item">
            <label>County:</label>
            <span>Clark County</span>
          </div>
          <div className="info-item">
            <label>Parcel #:</label>
            <span>162-45-034-1205</span>
          </div>
          <div className="info-item">
            <label>Property Type:</label>
            <span>High-Rise Condominium</span>
          </div>
        </div>
      </section>

      <section className="loan-info">
        <h2>LOAN INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Original Loan Amount:</label>
            <span>$425,000</span>
          </div>
          <div className="info-item">
            <label>Current Balance:</label>
            <span>$380,000</span>
          </div>
          <div className="info-item">
            <label>Lender:</label>
            <span>Nevada First Bank</span>
          </div>
          <div className="info-item">
            <label>Loan Type:</label>
            <span>30-Year Fixed</span>
          </div>
        </div>
      </section>

      <section className="foreclosure-info">
        <h2>TRUSTEE SALE INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Sale Date:</label>
            <span>September 26, 2024</span>
          </div>
          <div className="info-item">
            <label>Sale Time:</label>
            <span>10:00 AM PST</span>
          </div>
          <div className="info-item">
            <label>Sale Location:</label>
            <span>Outside main entrance of Clark County District Court, Las Vegas, NV</span>
          </div>
          <div className="info-item">
            <label>Opening Bid:</label>
            <span>$210,000</span>
          </div>
        </div>
      </section>

      <section className="property-condition">
        <h2>PROPERTY CONDITION</h2>
        <p>The subject property is a luxury 5-bedroom, 3-bathroom corner condominium on the 12th floor of the prestigious Baker Street high-rise. The unit features contemporary finishes, mountain and valley views, and premium location. The property is currently occupied. Cosmetic updates needed but overall structure is sound.</p>
        
        <h3>Key Features:</h3>
        <ul>
          <li>Floor-to-ceiling windows with mountain views</li>
          <li>Upgraded stainless steel appliances</li>
          <li>Granite countertops (kitchen and bathrooms)</li>
          <li>Large walk-in closets</li>
          <li>Two parking spaces (covered)</li>
        </ul>

        <h3>Estimated Repairs/Updates:</h3>
        <ul>
          <li>Interior painting: $6,500</li>
          <li>New carpet and flooring: $9,000</li>
          <li>Bathroom fixtures update: $8,500</li>
          <li>General maintenance and cleaning: $4,000</li>
        </ul>

        <h3>⚠️ OCCUPANCY NOTICE:</h3>
        <p>Property is currently occupied. Buyer will need to pursue eviction proceedings which typically take 3-6 months and cost $5,000-$15,000 in legal fees and moving costs.</p>
      </section>

      <section className="liens-encumbrances">
        <h2>LIENS & ENCUMBRANCES - ⚠️ CRITICAL INFORMATION</h2>
        <div className="liens-table">
          <div className="lien-entry warning-critical">
            <div className="lien-header">
              <span className="lien-type">🚨 HOA SUPERPRIORITY LIEN</span>
              <span className="lien-amount">$47,500</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Baker Street Condos Homeowners Association</p>
              <p><strong>Period Covered:</strong> Last 9 months of unpaid HOA fees and special assessments</p>
              <p><strong>Status:</strong> <strong>SURVIVES FORECLOSURE SALE</strong></p>
              <p><strong>IMPORTANT:</strong> Under Nevada Revised Statutes § 116.31161, HOA liens for unpaid assessments have superpriority status. This means this $47,500 lien will SURVIVE the foreclosure sale and attach to the property. YOU will become responsible for paying this amount PLUS ongoing monthly fees of $425.</p>
              <p><strong>Legal Impact:</strong> This superpriority lien is enforceable even if it exceeds a portion of the property's value.</p>
            </div>
          </div>

          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">First Deed of Trust (Being Foreclosed)</span>
              <span className="lien-amount">$380,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Nevada First Bank</p>
              <p><strong>Status:</strong> Will be paid off from sale proceeds</p>
            </div>
          </div>

          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">HOA Regular Lien</span>
              <span className="lien-amount">$18,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Baker Street Condos Homeowners Association</p>
              <p><strong>Description:</strong> Additional unpaid amounts (older assessments)</p>
              <p><strong>Status:</strong> Will likely be eliminated by foreclosure</p>
            </div>
          </div>
        </div>
      </section>

      <section className="hoa-information">
        <h2>HOMEOWNERS ASSOCIATION INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Association:</label>
            <span>Baker Street Condos HOA</span>
          </div>
          <div className="info-item">
            <label>Monthly Dues:</label>
            <span>$425</span>
          </div>
          <div className="info-item">
            <label>Special Assessment (Current):</label>
            <span>$1,200 (building renovations - 12 months)</span>
          </div>
          <div className="info-item">
            <label>Reserve Funding:</label>
            <span>48% - Below recommended 50%</span>
          </div>
        </div>

        <h3>Included Amenities:</h3>
        <ul>
          <li>24-hour concierge service</li>
          <li>Rooftop infinity pool</li>
          <li>Fitness center</li>
          <li>Business center</li>
          <li>Secure parking garage</li>
          <li>Regular building maintenance and insurance</li>
        </ul>
      </section>

      <section className="warning-section">
        <h2>⚠️ CRITICAL FINANCIAL ANALYSIS</h2>
        <div className="analysis-box warning">
          <p><strong>Opening Bid:</strong> $210,000</p>
          <p><strong>+ Your Survivor Lien:</strong> $47,500 (payable to HOA)</p>
          <p><strong>+ Monthly HOA Fees:</strong> $425/month ongoing</p>
          <p><strong>+ Eviction Costs:</strong> $5,000-$15,000</p>
          <p><strong>+ Repairs/Updates:</strong> $28,000</p>
          <hr/>
          <p><strong>Total Out-of-Pocket Cost:</strong> $290,500 - $300,500+</p>
          <p><strong>Market Value:</strong> $150,000 (after factoring in superpriority lien)</p>
          <p><strong>This Deal Has NEGATIVE EQUITY from day one.</strong></p>
        </div>
      </section>

      <section className="bidding-instructions">
        <h2>BIDDING INSTRUCTIONS</h2>
        <p><strong>Auction Type:</strong> Open Trustee Auction</p>
        <p><strong>Cashier's Check Required:</strong> $21,000 (10% of opening bid)</p>
        <p><strong>Balance Due:</strong> Within 24 hours</p>
        <p><strong>Property Condition:</strong> Sold as-is. Property currently occupied - buyer responsible for eviction.</p>
        <p><strong>⚠️ LIEN NOTICE:</strong> Buyer shall be responsible for all surviving liens including the HOA superpriority lien.</p>
      </section>

      <section className="disclaimer">
        <p><strong>DISCLAIMER:</strong> Under Nevada law, HOA superpriority liens for up to 9 months of assessments survive foreclosure and attach to the new owner. This property has a $47,500 surviving lien. Buyer assumes full responsibility for this obligation upon taking title.</p>
      </section>
    </div>
  </div>
);

// Case 4: Code Enforcement Lien (Tucson)
const Case004Announcement = () => (
  <div className="foreclosure-announcement">
    <div className="announcement-header">
      <div className="header-banner">NOTICE OF FORECLOSURE SALE</div>
      <div className="notice-date">Published: September 1, 2024</div>
    </div>

    <div className="announcement-content">
      <section className="property-info">
        <h2>PROPERTY DETAILS</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Address:</label>
            <span>4160 Government Way, Tucson, AZ 85701</span>
          </div>
          <div className="info-item">
            <label>County:</label>
            <span>Pima County</span>
          </div>
          <div className="info-item">
            <label>Parcel #:</label>
            <span>306-24-189-C</span>
          </div>
          <div className="info-item">
            <label>Property Type:</label>
            <span>Single Family Residential</span>
          </div>
        </div>
      </section>

      <section className="loan-info">
        <h2>LOAN INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Original Loan Amount:</label>
            <span>$165,000</span>
          </div>
          <div className="info-item">
            <label>Current Balance:</label>
            <span>$175,000</span>
          </div>
          <div className="info-item">
            <label>Lender:</label>
            <span>Tucson Community Bank</span>
          </div>
          <div className="info-item">
            <label>Delinquency Period:</label>
            <span>8 months</span>
          </div>
        </div>
      </section>

      <section className="foreclosure-info">
        <h2>FORECLOSURE SALE INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Sale Date:</label>
            <span>October 15, 2024</span>
          </div>
          <div className="info-item">
            <label>Sale Time:</label>
            <span>9:00 AM MST</span>
          </div>
          <div className="info-item">
            <label>Sale Location:</label>
            <span>Steps of Pima County Courthouse, 110 W Congress, Tucson, AZ</span>
          </div>
          <div className="info-item">
            <label>Opening Bid:</label>
            <span>$95,000</span>
          </div>
        </div>
      </section>

      <section className="property-condition">
        <h2>PROPERTY CONDITION</h2>
        <p>The subject property is a 3-bedroom, 2-bathroom single-family home on a corner lot. The property is currently vacant. Inspection reveals the structure is relatively sound but shows evidence of deferred maintenance. The property has undergone unauthorized modifications and additions that require attention.</p>
        
        <h3>Visible Condition Issues:</h3>
        <ul>
          <li>Unpermitted room addition to rear of house</li>
          <li>Unauthorized electrical work evident</li>
          <li>Plumbing additions without proper permits</li>
          <li>Deteriorated exterior siding</li>
          <li>Roof in fair condition (estimated 5-7 years life remaining)</li>
        </ul>

        <h3>Estimated Repairs (Per Seller's Assessment):</h3>
        <ul>
          <li>Interior updates and painting: $8,000</li>
          <li>New flooring: $6,000</li>
          <li>Exterior repairs and siding: $5,000</li>
          <li>Miscellaneous repairs: $3,000</li>
        </ul>
        
        <p><strong>NOTE:</strong> Actual repair costs may be significantly higher due to code compliance requirements for unpermitted work.</p>
      </section>

      <section className="liens-encumbrances">
        <h2>LIENS & ENCUMBRANCES</h2>
        <div className="liens-table">
          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">First Mortgage (Being Foreclosed)</span>
              <span className="lien-amount">$175,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Tucson Community Bank</p>
              <p><strong>Status:</strong> Foreclosing lien - will be paid off</p>
            </div>
          </div>

          <div className="lien-entry warning-critical">
            <div className="lien-header">
              <span className="lien-type">🚨 CITY CODE ENFORCEMENT LIEN</span>
              <span className="lien-amount">$35,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> City of Tucson Community Development Department</p>
              <p><strong>Filing Date:</strong> March 15, 2023</p>
              <p><strong>Violations:</strong></p>
              <ul>
                <li>Unpermitted room addition (1,200 sq ft)</li>
                <li>Unauthorized electrical work - safety hazard</li>
                <li>Improper plumbing installation</li>
                <li>Structural modifications without engineering review</li>
                <li>Non-compliant roofing materials used</li>
              </ul>
              <p><strong>Status:</strong> <strong>SURVIVES FORECLOSURE</strong> - This municipal lien will attach to the property and you will be responsible for bringing the property into compliance.</p>
              <p><strong>Compliance Requirements:</strong> The unpermitted additions must be either removed or brought up to current building code through costly renovations. This includes engineering reviews, permits, inspections, and potential structural modifications.</p>
              <p><strong>Estimated Compliance Cost:</strong> $40,000 - $60,000 (contractor estimates available from city records)</p>
            </div>
          </div>
        </div>
      </section>

      <section className="municipal-records">
        <h2>MUNICIPAL CODE VIOLATION HISTORY</h2>
        <div className="violation-timeline">
          <div className="violation-item">
            <span className="violation-date">April 2019</span>
            <span className="violation-event">Initial complaint filed - unpermitted addition observed</span>
          </div>
          <div className="violation-item">
            <span className="violation-date">June 2019</span>
            <span className="violation-event">Inspection ordered - violations confirmed</span>
          </div>
          <div className="violation-item">
            <span className="violation-date">March 2023</span>
            <span className="violation-event">Code Enforcement Lien filed for unpaid violation costs</span>
          </div>
          <div className="violation-item">
            <span className="violation-date">Ongoing</span>
            <span className="violation-event">Property remains non-compliant; monthly penalties accrue</span>
          </div>
        </div>
      </section>

      <section className="compliance-requirements">
        <h2>BUILDING CODE COMPLIANCE REQUIREMENTS</h2>
        <div className="compliance-box">
          <h3>Option 1: Remove Unauthorized Additions</h3>
          <p><strong>Cost:</strong> $25,000 - $35,000</p>
          <p><strong>Timeline:</strong> 4-8 weeks</p>
          <p><strong>Permits Required:</strong> Demolition, electrical disconnection</p>
          <p>This involves demolishing the unpermitted additions and restoring the property to its original footprint.</p>

          <h3>Option 2: Bring Property into Code Compliance</h3>
          <p><strong>Cost:</strong> $40,000 - $60,000</p>
          <p><strong>Timeline:</strong> 8-12 weeks</p>
          <p><strong>Permits Required:</strong> Building, electrical, plumbing, structural engineering</p>
          <p>This involves substantial renovations to bring all unpermitted work up to current code standards. Requires professional engineering review and city inspections at multiple stages.</p>

          <h3>Neither Option Can Be Avoided</h3>
          <p>The city will not issue any occupancy certificate or allow sale/refinancing without code compliance. You cannot legally rent or resell the property until one of these options is completed.</p>
        </div>
      </section>

      <section className="warning-section">
        <h2>⚠️ FINANCIAL REALITY CHECK</h2>
        <div className="analysis-box warning">
          <p><strong>Opening Bid:</strong> $95,000</p>
          <p><strong>+ Code Enforcement Lien (survivor):</strong> $35,000</p>
          <p><strong>+ Compliance Costs (minimum):</strong> $40,000</p>
          <p><strong>+ Original Repair Estimate:</strong> $22,000</p>
          <hr/>
          <p><strong>Total Investment Required:</strong> $192,000+</p>
          <p><strong>Market Value of Property (vacant, non-compliant):</strong> $65,000</p>
          <p><strong>Market Value After Code Compliance:</strong> $165,000</p>
          <p><strong>Result:</strong> Even after extensive work, you're barely at break-even, and this assumes no cost overruns or additional violations discovered during work.</p>
        </div>
      </section>

      <section className="bidding-instructions">
        <h2>BIDDING INSTRUCTIONS</h2>
        <p><strong>Auction Type:</strong> Court House Steps Auction</p>
        <p><strong>Cashier's Check Required:</strong> 10% of opening bid ($9,500) due day of sale</p>
        <p><strong>Balance Due:</strong> Within 24 hours</p>
        <p><strong>Property Condition:</strong> Sold as-is. Property available for inspection.</p>
        <p><strong>Code Compliance:</strong> Buyer assumes all responsibility for code violations and compliance costs.</p>
      </section>

      <section className="disclaimer">
        <p><strong>DISCLAIMER:</strong> This property has active code enforcement violations filed with the City of Tucson. The code enforcement lien survives foreclosure. Buyer assumes full liability for all violations and the costs of bringing the property into compliance. Municipal records are available for review at the Tucson Community Development Department (520-837-4800).</p>
      </section>
    </div>
  </div>
);

// Case 5: Good Deal (Scottsdale Pool Home)
const Case005Announcement = () => (
  <div className="foreclosure-announcement">
    <div className="announcement-header">
      <div className="header-banner">NOTICE OF FORECLOSURE SALE</div>
      <div className="notice-date">Published: July 28, 2024</div>
    </div>

    <div className="announcement-content">
      <section className="property-info">
        <h2>PROPERTY DETAILS</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Address:</label>
            <span>1313 Mockingbird Lane, Scottsdale, AZ 85251</span>
          </div>
          <div className="info-item">
            <label>County:</label>
            <span>Maricopa County</span>
          </div>
          <div className="info-item">
            <label>Parcel #:</label>
            <span>114-18-562-D</span>
          </div>
          <div className="info-item">
            <label>Property Type:</label>
            <span>Single Family Residential - Pool Home</span>
          </div>
        </div>
      </section>

      <section className="loan-info">
        <h2>LOAN INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Original Loan Amount:</label>
            <span>$468,000</span>
          </div>
          <div className="info-item">
            <label>Current Balance:</label>
            <span>$445,000</span>
          </div>
          <div className="info-item">
            <label>Lender:</label>
            <span>Scottsdale Savings Bank</span>
          </div>
          <div className="info-item">
            <label>Loan Type:</label>
            <span>30-Year Fixed (4.25%)</span>
          </div>
        </div>
      </section>

      <section className="foreclosure-info">
        <h2>FORECLOSURE SALE INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>Sale Date:</label>
            <span>September 10, 2024</span>
          </div>
          <div className="info-item">
            <label>Sale Time:</label>
            <span>10:00 AM MST</span>
          </div>
          <div className="info-item">
            <label>Sale Location:</label>
            <span>Steps of Maricopa County Courthouse, 201 W Jefferson, Phoenix, AZ</span>
          </div>
          <div className="info-item">
            <label>Opening Bid:</label>
            <span>$285,000</span>
          </div>
        </div>
      </section>

      <section className="property-condition">
        <h2>PROPERTY CONDITION</h2>
        <p>The subject property is an exceptional 4-bedroom, 3-bathroom pool home located in the desirable Mockingbird Lane neighborhood of north Scottsdale. The home was recently updated and sits on a large lot with mature landscaping. The property is currently vacant and in excellent condition.</p>
        
        <h3>Recent Updates & Upgrades:</h3>
        <ul>
          <li>Kitchen remodeled (2022) - custom cabinetry, granite counters, stainless appliances</li>
          <li>New HVAC system (2023)</li>
          <li>Roof replaced (2020)</li>
          <li>Master bathroom completely renovated (2022)</li>
          <li>Interior repainted (2023)</li>
          <li>Pool resurfaced (2021)</li>
        </ul>

        <h3>Minimal Work Needed:</h3>
        <ul>
          <li>Landscape replanting and new sod: $12,000</li>
          <li>Pool equipment service and repairs: $5,000</li>
          <li>Exterior pressure washing and touch-ups: $3,000</li>
          <li>Flooring refresh in secondary bedrooms: $8,000</li>
        </ul>
      </section>

      <section className="liens-encumbrances">
        <h2>LIENS & ENCUMBRANCES</h2>
        <div className="liens-table">
          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">First Mortgage (Being Foreclosed)</span>
              <span className="lien-amount">$445,000</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> Scottsdale Savings Bank</p>
              <p><strong>Status:</strong> Foreclosing lien - will be paid off from sale proceeds</p>
            </div>
          </div>

          <div className="lien-entry">
            <div className="lien-header">
              <span className="lien-type">Mechanics Lien</span>
              <span className="lien-amount">$8,500</span>
            </div>
            <div className="lien-details">
              <p><strong>Holder:</strong> ABC Roofing Company</p>
              <p><strong>Work Completed:</strong> Roof replacement (November 2023)</p>
              <p><strong>Status:</strong> Filed but legitimate - small amount relative to property value</p>
              <p><strong>Note:</strong> This is likely a junior lien that will be satisfied from sale proceeds or eliminated depending on total sale price versus first lien amount. The opening bid well exceeds this lien.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="market-analysis">
        <h2>MARKET ANALYSIS & COMPARABLE SALES</h2>
        <div className="analysis-box">
          <p><strong>Estimated Fair Market Value:</strong> $465,000</p>
          
          <h3>Recent Comparable Sales (Within 0.5 miles, last 90 days):</h3>
          <ul>
            <li>1301 Mockingbird Lane - $455,000 (4BR/3BA, similar condition)</li>
            <li>1420 Desert View - $470,000 (4BR/3BA, pool, recently updated)</li>
            <li>1510 Ridge Road - $468,000 (4BR/3BA, pool, excellent condition)</li>
          </ul>
          
          <p><strong>Neighborhood Appreciation:</strong> 4-5% annually over past 5 years</p>
          <p><strong>Rental Income Potential:</strong> $2,200 - $2,500/month (in-demand rental market)</p>
          <p><strong>Days on Market (if listed):</strong> Typically 15-25 days</p>
        </div>
      </section>

      <section className="hoa-information">
        <h2>PROPERTY & COMMUNITY INFORMATION</h2>
        <div className="info-grid">
          <div className="info-item">
            <label>HOA Status:</label>
            <span>None - Property is not in an HOA</span>
          </div>
          <div className="info-item">
            <label>Lot Size:</label>
            <span>0.65 acres</span>
          </div>
          <div className="info-item">
            <label>Year Built:</label>
            <span>1996</span>
          </div>
          <div className="info-item">
            <label>Square Footage:</label>
            <span>2,840 sq ft</span>
          </div>
        </div>

        <h3>Neighborhood Amenities:</h3>
        <ul>
          <li>Excellent school district (top-rated in Arizona)</li>
          <li>Close to Scottsdale downtown and shopping</li>
          <li>Low crime area</li>
          <li>Well-maintained neighborhood with active community</li>
          <li>Nearby hiking and recreational trails</li>
        </ul>
      </section>

      <section className="investment-summary">
        <h2>INVESTMENT OPPORTUNITY SUMMARY</h2>
        <div className="analysis-box good-deal">
          <p><strong>Opening Bid:</strong> $285,000</p>
          <p><strong>Estimated Fair Market Value:</strong> $465,000</p>
          <p><strong>Estimated Equity Available:</strong> ~$180,000</p>
          <hr/>
          <p><strong>Key Advantages:</strong></p>
          <ul>
            <li>✓ Recently updated - minimal repair costs needed</li>
            <li>✓ Excellent school district location</li>
            <li>✓ Pool home in high-demand market</li>
            <li>✓ Strong rental income potential</li>
            <li>✓ No HOA - full ownership and control</li>
            <li>✓ Mechanics lien is small and manageable</li>
            <li>✓ Strong neighborhood appreciation history</li>
            <li>✓ Price significantly below market value</li>
          </ul>
          
          <p><strong>This represents a solid investment opportunity with strong upside potential.</strong></p>
        </div>
      </section>

      <section className="bidding-instructions">
        <h2>BIDDING INSTRUCTIONS</h2>
        <p><strong>Auction Type:</strong> Courthouse Steps Foreclosure Auction</p>
        <p><strong>Cashier's Check Required:</strong> 10% of opening bid ($28,500) due day of sale</p>
        <p><strong>Balance Due:</strong> Within 24 hours</p>
        <p><strong>Property Condition:</strong> Sold as-is, where-is. Property available for inspection 48 hours prior to sale.</p>
        <p><strong>Title Transfer:</strong> Arizona Trustee Deed to buyer upon receipt of full payment.</p>
      </section>

      <section className="disclaimer">
        <p><strong>DISCLAIMER:</strong> This property is sold in its present condition. The opening bid represents the lender's estimate of the property's value. The property is available for inspection prior to sale. Title will transfer free and clear of the foreclosing mortgage. A small mechanics lien for recent roofing work may survive, though it is likely to be paid from excess sale proceeds.</p>
      </section>
    </div>
  </div>
);

export const ForeclosureAnnouncement: React.FC<AnnouncementProps> = ({ caseId }) => {
  const getAnnouncement = () => {
    switch (caseId) {
      case 'case-001':
        return <Case001Announcement />;
      case 'case-002':
        return <Case002Announcement />;
      case 'case-003':
        return <Case003Announcement />;
      case 'case-004':
        return <Case004Announcement />;
      case 'case-005':
        return <Case005Announcement />;
      default:
        return <div>Unknown case</div>;
    }
  };

  return getAnnouncement();
};

export default ForeclosureAnnouncement;
