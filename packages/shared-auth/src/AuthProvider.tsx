import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { User, AuthState } from '@deal-platform/shared-types';
import { api } from './ApiService';

interface AuthContextType extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getInitialAuthState(): { authState: AuthState; loading: boolean } {
  try {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      const user = JSON.parse(savedUser);
      return {
        authState: { isAuthenticated: true, user, token },
        loading: false,
      };
    }
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
  return {
    authState: { isAuthenticated: false, user: null, token: null },
    loading: false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = getInitialAuthState();
  const [authState, setAuthState] = useState<AuthState>(initial.authState);
  const [loading] = useState(initial.loading);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthState({ isAuthenticated: false, user: null, token: null });
  }, []);

  // Set up unauthorized handler
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      logout();
    });
  }, [logout]);

  // Refresh user profile from server on mount (initial state already set synchronously)
  useEffect(() => {
    if (authState.isAuthenticated) {
      api.getCurrentUser().then((data: { user: User }) => {
        const freshUser = data.user;
        localStorage.setItem('user', JSON.stringify(freshUser));
        setAuthState(prev => ({ ...prev, user: freshUser }));
      }).catch(() => {
        // If refresh fails (e.g. expired token), keep cached user
      });
    }
  }, []);

  // Handle OAuth callback tokens in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userStr = params.get('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr));
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setAuthState({ isAuthenticated: true, user, token });
        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('Failed to parse OAuth callback:', error);
      }
    }
  }, []);

  const login = useCallback((token: string, user: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setAuthState({ isAuthenticated: true, user, token });
  }, []);

  const updateUser = useCallback((user: User) => {
    localStorage.setItem('user', JSON.stringify(user));
    setAuthState(prev => ({ ...prev, user }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
