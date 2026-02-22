-- Migration: Add How Many Assets and Passive Income Club resources

INSERT INTO resources (title, description, content, type, url, category, is_premium, sort_order) VALUES
  ('How Many Assets Hub',
   'Members-only learning platform by Will Myers with courses, deal breakdowns, and asset training for building passive income.',
   'How Many Assets is a premium membership hub from Money Man Will Myers. It features structured courses, video walkthroughs, and resources for building your passive income portfolio.\n\n## What''s Inside\n- Step-by-step courses on acquiring income-producing assets\n- Live deal breakdowns and case studies\n- Asset-specific training modules\n- Downloadable templates and checklists\n- Direct access to Will Myers'' strategies\n\n## Topics Covered\n- Foreclosure investing\n- Real estate wholesaling\n- Airbnb / short-term rentals\n- Self-storage facilities\n- RV parks\n- Ice machines & vending\n\nVisit [howmanyassets.com](https://howmanyassets.com/) to log in or learn more.',
   'external', 'https://howmanyassets.com/', 'Learning', TRUE, 7),

  ('Passive Income Club (Skool)',
   'Join Will Myers'' private community of 350+ investors learning to build cashflowing assets — live reviews, deal breakdowns, and step-by-step training.',
   'The Passive Income Club is a private Skool community run by Money Man Will Myers. It''s designed for serious investors who want hands-on guidance building passive income streams.\n\n## What You Get\n- The first 7 steps to get your first (or next) passive income asset\n- LIVE asset reviews and deal breakdowns\n- How to find profit in any asset\n\n## Asset-Specific Training\n- Airbnb & short-term rentals\n- Real estate investing\n- RV parks\n- Ice machines & vending\n- Self-storage\n- Foreclosures\n\n## Community Benefits\n- Connect with 350+ like-minded investors\n- Share insights and support each other\n- Active, engaged community — no lurking\n\nRegister at [willsfreeclass.com/jointheclub](https://www.willsfreeclass.com/jointheclub) to join.',
   'external', 'https://www.skool.com/pic', 'Community', TRUE, 8)
ON CONFLICT DO NOTHING;
