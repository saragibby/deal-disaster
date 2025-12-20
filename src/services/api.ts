// In production, API is served from the same origin
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');

class ApiService {
  private getHeaders(includeAuth = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (includeAuth) {
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  async register(email: string, password: string, name?: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    return response.json();
  }

  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    return response.json();
  }

  async getCurrentUser() {
    const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      throw new Error('Failed to get user');
    }

    return response.json();
  }

  async saveGameSession(score: {
    points: number;
    casesSolved: number;
    goodDeals: number;
    badDealsAvoided: number;
    mistakes: number;
    redFlagsFound: number;
  }) {
    const response = await fetch(`${API_BASE_URL}/api/game/sessions`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(score),
    });

    if (!response.ok) {
      throw new Error('Failed to save game session');
    }

    return response.json();
  }

  async getGameHistory() {
    const response = await fetch(`${API_BASE_URL}/api/game/sessions`, {
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      throw new Error('Failed to get game history');
    }

    return response.json();
  }

  async getUserStats() {
    const response = await fetch(`${API_BASE_URL}/api/game/stats`, {
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      throw new Error('Failed to get stats');
    }

    return response.json();
  }

  async getLeaderboard() {
    const response = await fetch(`${API_BASE_URL}/api/game/leaderboard`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get leaderboard');
    }

    return response.json();
  }
}

export const api = new ApiService();
