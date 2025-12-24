// In production (Heroku), use same origin. In dev, use localhost:3001
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const API_BASE_URL = isProduction ? '' : 'http://localhost:3001';

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

  async getLeaderboard() {
    const response = await fetch(`${API_BASE_URL}/api/game/leaderboard`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get leaderboard');
    }

    return response.json();
  }

  async getDailyLeaderboard() {
    const response = await fetch(`${API_BASE_URL}/api/daily-challenge/leaderboard`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get daily leaderboard');
    }

    return response.json();
  }

  async getDailyChallenge() {
    const response = await fetch(`${API_BASE_URL}/api/daily-challenge/today`, {
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get daily challenge');
    }

    return response.json();
  }

  async completeDailyChallenge(challengeId: number, data: {
    decision: 'BUY' | 'INVESTIGATE' | 'WALK_AWAY';
    points_earned: number;
    time_taken: number;
  }) {
    const response = await fetch(`${API_BASE_URL}/api/daily-challenge/${challengeId}/complete`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to complete daily challenge');
    }

    return response.json();
  }

  async getDailyChallengeHistory(page: number = 1) {
    const response = await fetch(`${API_BASE_URL}/api/daily-challenge/history?page=${page}`, {
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get challenge history');
    }

    return response.json();
  }

  async getDailyChallengeByDate(date: string) {
    const response = await fetch(`${API_BASE_URL}/api/daily-challenge/date/${date}`, {
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get challenge for date');
    }

    return response.json();
  }

  async getUserStats() {
    const response = await fetch(`${API_BASE_URL}/api/auth/stats`, {
      headers: this.getHeaders(true),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get user stats');
    }

    return response.json();
  }

  async chat(message: string, conversationHistory: Array<{ role: string; content: string }> = []) {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ message, conversationHistory }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Chat request failed');
    }

    return response.json();
  }
}

export const api = new ApiService();
