import { useAuth, buildAppUrl } from '@deal-platform/shared-auth';
import { AskWill } from '@deal-platform/shared-ui';
import { LogOut, User } from 'lucide-react';
import Footer from './components/Footer';
import PropertyAnalyzer from './components/PropertyAnalyzer';
import LoginGate from './components/LoginGate';

export default function App() {
  const { isAuthenticated, loading, user, logout } = useAuth();

  return (
    <div className="analyzer-app">
      {/* Minimal header — transparent on gradient */}
      <header className="analyzer-app__header">
        <a href={buildAppUrl('/')} className="analyzer-app__logo">
          ⚡ Passive Income Club
        </a>

        <nav className="analyzer-app__nav">
          <a href={buildAppUrl('/')} className="analyzer-app__nav-link">Home</a>
          <a href={buildAppUrl('/games')} className="analyzer-app__nav-link">Games</a>
          <a href={buildAppUrl('/tools')} className="analyzer-app__nav-link">Tools</a>

          {isAuthenticated && user ? (
            <>
              <a href={buildAppUrl('/profile')} className="analyzer-app__user">
                <User size={16} /> {user.name || user.email}
              </a>
              <button className="analyzer-app__logout" onClick={() => logout()} title="Sign out">
                <LogOut size={14} />
              </button>
            </>
          ) : null}
        </nav>
      </header>

      {/* Main content */}
      <main className="analyzer-app__content">
        {loading ? (
          <div className="analyzer-loading">
            <div className="analyzer-spinner" />
            <p>Loading...</p>
          </div>
        ) : !isAuthenticated ? (
          <LoginGate />
        ) : (
          <PropertyAnalyzer />
        )}
      </main>

      {isAuthenticated && <AskWill />}
      <Footer />
    </div>
  );
}
