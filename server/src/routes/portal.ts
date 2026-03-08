import { Router, Response } from 'express';
import { pool } from '../db/pool.js';
import { authenticateToken, authenticateOptional, AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// ===================================================================
// PUBLIC / OPTIONAL-AUTH ENDPOINTS
// ===================================================================

// GET /api/portal/games — list of available games
router.get('/games', (_req, res) => {
  const games = [
    {
      id: 'deal-or-disaster',
      name: 'Deal or Disaster',
      description: 'Master foreclosure investing by analyzing real estate auction properties. Spot red flags, calculate true costs, and decide: is it a deal or a disaster?',
      shortDescription: 'Master foreclosure investing with real auction scenarios',
      path: '/deal-or-disaster/',
      icon: '🏠',
      status: 'live',
      category: 'Real Estate',
      color: '#e74c3c',
    },
    {
      id: 'flip-or-flop',
      name: 'Flip or Flop',
      description: 'Buy properties, manage renovation budgets, and sell for profit.',
      shortDescription: 'Renovate and flip properties for maximum profit',
      path: '/flip-or-flop/',
      icon: '🔨',
      status: 'coming-soon',
      category: 'Real Estate',
      color: '#f39c12',
    },
    {
      id: 'landlord-tycoon',
      name: 'Landlord Tycoon',
      description: 'Build a rental empire. Screen tenants, manage properties, and grow your portfolio.',
      shortDescription: 'Build and manage a rental property empire',
      path: '/landlord-tycoon/',
      icon: '🏢',
      status: 'coming-soon',
      category: 'Real Estate',
      color: '#3498db',
    },
  ];

  res.json({ games });
});

// GET /api/portal/landing — aggregated data for public landing page
router.get('/landing', async (_req, res) => {
  try {
    const games = [
      {
        id: 'deal-or-disaster',
        name: 'Deal or Disaster',
        description: 'Master foreclosure investing by analyzing real estate auction properties. Spot red flags, calculate true costs, and decide: is it a deal or a disaster?',
        shortDescription: 'Master foreclosure investing with real auction scenarios',
        path: '/deal-or-disaster/',
        icon: '🏠',
        status: 'live',
        category: 'Real Estate',
        color: '#e74c3c',
        is_featured: true,
      },
      {
        id: 'flip-or-flop',
        name: 'Flip or Flop',
        description: 'Buy properties, manage renovation budgets, and sell for profit.',
        shortDescription: 'Renovate and flip properties for maximum profit',
        path: '/flip-or-flop/',
        icon: '🔨',
        status: 'coming-soon',
        category: 'Real Estate',
        color: '#f39c12',
      },
      {
        id: 'landlord-tycoon',
        name: 'Landlord Tycoon',
        description: 'Build a rental empire. Screen tenants, manage properties, and grow your portfolio.',
        shortDescription: 'Build and manage a rental property empire',
        path: '/landlord-tycoon/',
        icon: '🏢',
        status: 'coming-soon',
        category: 'Real Estate',
        color: '#3498db',
      },
      {
        id: 'market-mayhem',
        name: 'Market Mayhem',
        description: 'Navigate real estate market cycles. Time your buys and sells, manage a portfolio through booms and busts.',
        shortDescription: 'Time the market through real estate cycles',
        path: '/market-mayhem/',
        icon: '📈',
        status: 'coming-soon',
        category: 'Finance',
        color: '#2ecc71',
      },
    ];

    // Fetch featured resources (public preview)
    const resourcesResult = await pool.query(
      `SELECT id, title, description, type, url, category, is_premium, is_featured, sort_order
       FROM resources
       WHERE is_featured = TRUE
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 6`
    );

    // Fetch tools (public preview)
    const toolsResult = await pool.query(
      `SELECT id, name, description, type, url, category, icon, is_premium, sort_order
       FROM tools
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 6`
    );

    res.json({
      games,
      resources: resourcesResult.rows,
      tools: toolsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching landing page data:', error);
    res.json({ games: [], resources: [], tools: [] });
  }
});

// GET /api/portal/announcements — active news and updates from DB
router.get('/announcements', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content, type, is_active, created_at, updated_at FROM announcements WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 10'
    );
    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.json({ announcements: [] });
  }
});

// GET /api/portal/leaderboard — cross-game leaderboard
router.get('/leaderboard', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id as user_id, u.name, u.avatar,
        COALESCE(SUM(gs.points), 0) as total_points,
        COUNT(gs.id) as games_played
      FROM users u
      LEFT JOIN game_sessions gs ON u.id = gs.user_id
      GROUP BY u.id, u.name, u.avatar
      HAVING COALESCE(SUM(gs.points), 0) > 0
      ORDER BY total_points DESC
      LIMIT 50
    `);

    const leaderboard = result.rows.map((row: any, i: number) => ({
      rank: i + 1,
      user_id: row.user_id,
      name: row.name || 'Anonymous',
      avatar: row.avatar,
      total_points: parseInt(row.total_points),
      games_played: parseInt(row.games_played),
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching cross-game leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ===================================================================
// RESOURCES — public list (preview for unauth), full content for auth
// ===================================================================

// GET /api/portal/resources — list all resources
// Unauthenticated: title + description only (first 2 non-premium items get content)
// Authenticated: full content for all items
router.get('/resources', authenticateOptional, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM resources ORDER BY is_featured DESC, sort_order ASC, created_at DESC'
    );

    const isAuthenticated = !!req.user;
    let previewCount = 0;

    const resources = result.rows.map((row: any) => {
      const base = {
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        url: row.url,
        category: row.category,
        is_premium: row.is_premium,
        is_featured: row.is_featured || false,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      // Authenticated users get full content
      if (isAuthenticated) {
        return { ...base, content: row.content };
      }

      // Unauthenticated: show content for first 2 non-premium items as teasers
      if (!row.is_premium && previewCount < 2) {
        previewCount++;
        return { ...base, content: row.content };
      }

      // Everything else: no content (locked)
      return { ...base, content: null };
    });

    res.json({ resources });
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// GET /api/portal/resources/:id — single resource (auth required for premium)
router.get('/resources/:id', authenticateOptional, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM resources WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const row = result.rows[0];
    const isAuthenticated = !!req.user;

    const resource: any = {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type,
      url: row.url,
      category: row.category,
      is_premium: row.is_premium,
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    // Include content only if authenticated or non-premium
    if (isAuthenticated || !row.is_premium) {
      resource.content = row.content;
    }

    res.json({ resource });
  } catch (error) {
    console.error('Error fetching resource:', error);
    res.status(500).json({ error: 'Failed to fetch resource' });
  }
});

// ===================================================================
// TOOLS — same preview/auth pattern as resources
// ===================================================================

// GET /api/portal/tools — list all tools
router.get('/tools', authenticateOptional, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tools ORDER BY sort_order ASC, created_at DESC'
    );

    const isAuthenticated = !!req.user;
    let previewCount = 0;

    const tools = result.rows.map((row: any) => {
      const base = {
        id: row.id,
        name: row.name,
        description: row.description,
        type: row.type,
        url: row.url,
        category: row.category,
        icon: row.icon,
        is_premium: row.is_premium,
        is_featured: row.is_featured || false,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      if (isAuthenticated) {
        return { ...base, content: row.content };
      }

      if (!row.is_premium && previewCount < 2) {
        previewCount++;
        return { ...base, content: row.content };
      }

      return { ...base, content: null };
    });

    res.json({ tools });
  } catch (error) {
    console.error('Error fetching tools:', error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// GET /api/portal/tools/:id — single tool
router.get('/tools/:id', authenticateOptional, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM tools WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    const row = result.rows[0];
    const isAuthenticated = !!req.user;

    const tool: any = {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      url: row.url,
      category: row.category,
      icon: row.icon,
      is_premium: row.is_premium,
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    if (isAuthenticated || !row.is_premium) {
      tool.content = row.content;
    }

    res.json({ tool });
  } catch (error) {
    console.error('Error fetching tool:', error);
    res.status(500).json({ error: 'Failed to fetch tool' });
  }
});

// ===================================================================
// ADMIN CRUD — requires auth + admin role
// ===================================================================

// --- Resources Admin ---

// POST /api/portal/admin/resources — create resource
router.post('/admin/resources', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, content, type, url, category, is_premium, sort_order } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const result = await pool.query(
      `INSERT INTO resources (title, description, content, type, url, category, is_premium, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [title, description, content || null, type || 'article', url || null, category || 'General', is_premium || false, sort_order || 0, req.userId]
    );

    res.status(201).json({ resource: result.rows[0] });
  } catch (error) {
    console.error('Error creating resource:', error);
    res.status(500).json({ error: 'Failed to create resource' });
  }
});

// PUT /api/portal/admin/resources/:id — update resource
router.put('/admin/resources/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, content, type, url, category, is_premium, sort_order } = req.body;

    const result = await pool.query(
      `UPDATE resources SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        content = $3,
        type = COALESCE($4, type),
        url = $5,
        category = COALESCE($6, category),
        is_premium = COALESCE($7, is_premium),
        sort_order = COALESCE($8, sort_order),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [title, description, content, type, url, category, is_premium, sort_order, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    res.json({ resource: result.rows[0] });
  } catch (error) {
    console.error('Error updating resource:', error);
    res.status(500).json({ error: 'Failed to update resource' });
  }
});

// DELETE /api/portal/admin/resources/:id — delete resource
router.delete('/admin/resources/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM resources WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    res.json({ message: 'Resource deleted' });
  } catch (error) {
    console.error('Error deleting resource:', error);
    res.status(500).json({ error: 'Failed to delete resource' });
  }
});

// --- Tools Admin ---

// POST /api/portal/admin/tools — create tool
router.post('/admin/tools', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, content, type, url, category, icon, is_premium, is_featured, sort_order } = req.body;
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    const result = await pool.query(
      `INSERT INTO tools (name, description, content, type, url, category, icon, is_premium, is_featured, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [name, description, content || null, type || 'calculator', url || null, category || 'General', icon || '🔧', is_premium || false, is_featured || false, sort_order || 0, req.userId]
    );

    res.status(201).json({ tool: result.rows[0] });
  } catch (error) {
    console.error('Error creating tool:', error);
    res.status(500).json({ error: 'Failed to create tool' });
  }
});

// PUT /api/portal/admin/tools/:id — update tool
router.put('/admin/tools/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, content, type, url, category, icon, is_premium, is_featured, sort_order } = req.body;

    const result = await pool.query(
      `UPDATE tools SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        content = $3,
        type = COALESCE($4, type),
        url = $5,
        category = COALESCE($6, category),
        icon = COALESCE($7, icon),
        is_premium = COALESCE($8, is_premium),
        is_featured = COALESCE($9, is_featured),
        sort_order = COALESCE($10, sort_order),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 RETURNING *`,
      [name, description, content, type, url, category, icon, is_premium, is_featured, sort_order, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({ tool: result.rows[0] });
  } catch (error) {
    console.error('Error updating tool:', error);
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

// DELETE /api/portal/admin/tools/:id — delete tool
router.delete('/admin/tools/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM tools WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({ message: 'Tool deleted' });
  } catch (error) {
    console.error('Error deleting tool:', error);
    res.status(500).json({ error: 'Failed to delete tool' });
  }
});

// --- Announcements Admin ---

// GET /api/portal/admin/announcements — all announcements (incl. inactive) for admin
router.get('/admin/announcements', authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM announcements ORDER BY created_at DESC'
    );
    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Error fetching admin announcements:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// POST /api/portal/admin/announcements — create announcement
router.post('/admin/announcements', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, type, is_active } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await pool.query(
      `INSERT INTO announcements (title, content, type, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, content, type || 'news', is_active !== false, req.userId]
    );

    res.status(201).json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// PUT /api/portal/admin/announcements/:id — update announcement
router.put('/admin/announcements/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, type, is_active } = req.body;

    const result = await pool.query(
      `UPDATE announcements SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        type = COALESCE($3, type),
        is_active = COALESCE($4, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [title, content, type, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// DELETE /api/portal/admin/announcements/:id — delete announcement
router.delete('/admin/announcements/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

export default router;
