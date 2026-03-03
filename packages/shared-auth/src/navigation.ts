/**
 * Cross-app navigation utility for the platform.
 *
 * In production all apps share the same origin so localStorage (and thus
 * auth tokens) are automatically available everywhere.
 *
 * In development each app runs on its own port, which means different
 * origins and separate localStorage stores.  To provide seamless SSO we
 * append the current auth token and user data as URL query-params when
 * navigating between apps in dev mode.  The target app picks them up on
 * mount, stores them in its own localStorage, and clears the URL.
 */

/** Map app base-paths to their dev-server ports. */
const DEV_APP_PORTS: Record<string, number> = {
  '/deal-or-disaster/': 5201,
  '/property-analyzer/': 5202,
};

/** The dashboard port — used as the default for any path not in DEV_APP_PORTS. */
const DASHBOARD_PORT = 5200;

/**
 * Build a full URL for navigating to another app in the platform.
 *
 * @param appPath  The production base-path of the target app, e.g.
 *                 `'/deal-or-disaster/'`
 * @returns        A URL string.  In dev mode it will point at the correct
 *                 localhost port and include `?token=...&user=...` when the
 *                 current user is authenticated.
 */
export function buildAppUrl(appPath: string): string {
  const isDev =
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost';

  let url: string;

  if (isDev) {
    const port = DEV_APP_PORTS[appPath] || DASHBOARD_PORT;
    url = `http://localhost:${port}${appPath}`;

    // Different ports → different origins → separate localStorage.
    // Pass auth tokens via URL so the target app can establish its session.
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      const params = new URLSearchParams();
      params.set('token', token);
      params.set('user', encodeURIComponent(user));
      url += `?${params.toString()}`;
    }
  } else {
    // Same origin in production – localStorage is shared.
    url = appPath;
  }

  return url;
}

/**
 * On the *receiving* side: check the current URL for SSO token params that
 * were passed by the dashboard (or any other app).  If found, store them
 * in localStorage and strip the params from the URL.
 *
 * @returns `{ token, user }` if SSO params were present, or `null`.
 */
export function consumeSsoParams(): { token: string; user: any } | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const userStr = params.get('user');

  if (!token || !userStr) return null;

  try {
    const user = JSON.parse(decodeURIComponent(userStr));

    // Persist in localStorage so subsequent navigations / refreshes work.
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));

    // Clean the URL so tokens aren't sitting in the address bar / history.
    window.history.replaceState({}, '', window.location.pathname);

    return { token, user };
  } catch (err) {
    console.error('[SSO] Failed to parse SSO params:', err);
    return null;
  }
}
