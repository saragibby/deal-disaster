import { Link, NavLink } from 'react-router-dom';
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
            <Link to="/" className="app-shell__logo">
              {logoSrc ? (
                <img src={logoSrc} alt={title} className="app-shell__logo-img" />
              ) : (
                <span className="app-shell__logo-icon">💰</span>
              )}
              <span className="app-shell__logo-text">{title}</span>
            </Link>
          </div>
          <nav className="app-shell__nav">
            <NavLink to="/" end className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}>Home</NavLink>
            <NavLink to="/games" className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}>Games</NavLink>
            <NavLink to="/resources" className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}>Resources</NavLink>
            <NavLink to="/tools" className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}>Tools</NavLink>
            <NavLink to="/leaderboard" className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}>Leaderboard</NavLink>
          </nav>
          <div className="app-shell__header-right">
            {isAuthenticated && user ? (
              <div className="app-shell__user-menu">
                {user.is_admin && (
                  <Link to="/admin" className="app-shell__admin-link" title="Admin">
                    <Shield size={18} />
                  </Link>
                )}
                <Link to="/profile" className="app-shell__user-info">
                  <User size={18} />
                  <span>{user.name || user.email}</span>
                </Link>
                <button onClick={logout} className="app-shell__logout-btn" title="Sign out">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="app-shell__login-btn">Sign In</Link>
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
