/**
 * Cross-app navigation utility for the platform.
 *
 * All sub-apps are proxied through the dashboard (port 5200) in development,
 * mirroring the production Express setup.  Because every app shares the same
 * origin, localStorage (and thus auth state) is unified across apps — no
 * cross-origin SSO tokens are needed.
 *
 * If a sub-app is accessed directly on its own port (e.g. localhost:5201),
 * SSO params are still appended as a fallback.
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
 * @returns        A URL string.  In dev mode, returns a same-origin path
 *                 when accessed through the proxy (port 5200).  Falls back
 *                 to cross-port SSO URLs for direct sub-app access.
 */
export function buildAppUrl(appPath: string): string {
  const isDev =
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost';

  if (!isDev) {
    // Same origin in production – just return the path.
    return appPath;
  }

  const currentPort = window.location.port;

  // When accessed through the dashboard proxy (port 5200), all apps share
  // the same origin so localStorage is already shared — simple path works.
  if (currentPort === String(DASHBOARD_PORT)) {
    return appPath;
  }

  // Fallback: direct sub-app access on its own port — pass SSO params.
  const matchedApp = Object.keys(DEV_APP_PORTS).find(prefix => appPath.startsWith(prefix));
  const port = matchedApp ? DEV_APP_PORTS[matchedApp] : DASHBOARD_PORT;
  let url = `http://localhost:${port}${appPath}`;

  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (token && user) {
    const params = new URLSearchParams();
    params.set('token', token);
    params.set('user', encodeURIComponent(user));
    url += `?${params.toString()}`;
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
