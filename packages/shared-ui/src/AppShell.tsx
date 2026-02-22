import { useAuth } from '@deal-platform/shared-auth';
import { User, LogOut, Shield } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  title?: string;
  logoSrc?: string;
  showNav?: boolean;
}

export function AppShell({ children, footer, title = 'Passive Income Club', logoSrc, showNav = true }: AppShellProps) {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <div className="app-shell">
      {showNav && (
        <header className="app-shell__header">
          <div className="app-shell__header-left">
            <a href="/" className="app-shell__logo">
              {logoSrc ? (
                <img src={logoSrc} alt={title} className="app-shell__logo-img" />
              ) : (
                <span className="app-shell__logo-icon">💰</span>
              )}
              <span className="app-shell__logo-text">{title}</span>
            </a>
          </div>
          <nav className="app-shell__nav">
            <a href="/" className="app-shell__nav-link">Home</a>
            <a href="/games" className="app-shell__nav-link">Games</a>
            <a href="/resources" className="app-shell__nav-link">Resources</a>
            <a href="/tools" className="app-shell__nav-link">Tools</a>
            <a href="/leaderboard" className="app-shell__nav-link">Leaderboard</a>
          </nav>
          <div className="app-shell__header-right">
            {isAuthenticated && user ? (
              <div className="app-shell__user-menu">
                {user.is_admin && (
                  <a href="/admin" className="app-shell__admin-link" title="Admin">
                    <Shield size={18} />
                  </a>
                )}
                <a href="/profile" className="app-shell__user-info">
                  <User size={18} />
                  <span>{user.name || user.email}</span>
                </a>
                <button onClick={logout} className="app-shell__logout-btn" title="Sign out">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <a href="/login" className="app-shell__login-btn">Sign In</a>
            )}
          </div>
        </header>
      )}
      <main className="app-shell__content">
        {children}
      </main>
      {footer}
    </div>
  );
}
