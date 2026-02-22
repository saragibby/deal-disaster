// Shared API service for all apps in the platform
// In production (same-origin), use ''. In dev, use localhost:3001.

const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const API_BASE_URL = isProduction ? '' : 'http://localhost:3001';

export class ApiService {
  private onUnauthorized?: () => void;

  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  async handleResponse(response: Response) {
    if (response.status === 401 || response.status === 403) {
      if (this.onUnauthorized) {
        this.onUnauthorized();
      }
      throw new Error('Session expired. Please login again.');
    }
    return response;
  }

  getHeaders(includeAuth = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (includeAuth) {
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      headers['X-User-Timezone'] = timezone;
    } catch {
      headers['X-User-Timezone'] = 'UTC';
    }

    return headers;
  }

  getBaseUrl() {
    return API_BASE_URL;
  }

  // ===== Auth endpoints (shared across all apps) =====

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
    await this.handleResponse(response);
    if (!response.ok) {
      throw new Error('Failed to get user');
    }
    return response.json();
  }

  async getUserProfile() {
    const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
      headers: this.getHeaders(true),
    });
    await this.handleResponse(response);
    if (!response.ok) {
      throw new Error('Failed to get profile');
    }
    return response.json();
  }

  async updateProfile(data: { name?: string; username?: string; phone_number?: string; sms_opt_in?: boolean; email_newsletter_opt_in?: boolean }) {
    const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to update profile');
    }
    return response.json();
  }

  async getUserStats() {
    const response = await fetch(`${API_BASE_URL}/api/auth/stats`, {
      headers: this.getHeaders(true),
    });
    await this.handleResponse(response);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get user stats');
    }
    return response.json();
  }

  async submitFeedback(message: string) {
    const response = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ message }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit feedback');
    }
    return response.json();
  }

  // ===== Portal endpoints =====

  async getGames() {
    const response = await fetch(`${API_BASE_URL}/api/portal/games`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to get games');
    }
    return response.json();
  }

  async getAnnouncements() {
    const response = await fetch(`${API_BASE_URL}/api/portal/announcements`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to get announcements');
    }
    return response.json();
  }

  async getCrossLeaderboard() {
    const response = await fetch(`${API_BASE_URL}/api/portal/leaderboard`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to get leaderboard');
    }
    return response.json();
  }

  // ===== Resources endpoints =====

  async getResources() {
    const response = await fetch(`${API_BASE_URL}/api/portal/resources`, {
      headers: this.getHeaders(true), // send auth if available (optional on server)
    });
    if (!response.ok) throw new Error('Failed to get resources');
    return response.json();
  }

  async getResource(id: number) {
    const response = await fetch(`${API_BASE_URL}/api/portal/resources/${id}`, {
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to get resource');
    return response.json();
  }

  // ===== Tools endpoints =====

  async getTools() {
    const response = await fetch(`${API_BASE_URL}/api/portal/tools`, {
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to get tools');
    return response.json();
  }

  async getTool(id: number) {
    const response = await fetch(`${API_BASE_URL}/api/portal/tools/${id}`, {
      headers: this.getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to get tool');
    return response.json();
  }

  // ===== Admin CRUD endpoints =====

  async createResource(data: Record<string, any>) {
    return this.fetchJson('/api/portal/admin/resources', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
  }

  async updateResource(id: number, data: Record<string, any>) {
    return this.fetchJson(`/api/portal/admin/resources/${id}`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(data),
    });
  }

  async deleteResource(id: number) {
    return this.fetchJson(`/api/portal/admin/resources/${id}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async createTool(data: Record<string, any>) {
    return this.fetchJson('/api/portal/admin/tools', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
  }

  async updateTool(id: number, data: Record<string, any>) {
    return this.fetchJson(`/api/portal/admin/tools/${id}`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(data),
    });
  }

  async deleteTool(id: number) {
    return this.fetchJson(`/api/portal/admin/tools/${id}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  // ===== Admin Announcements CRUD =====

  async getAdminAnnouncements() {
    return this.fetchJson<{ announcements: any[] }>('/api/portal/admin/announcements', {
      auth: true,
    });
  }

  async createAnnouncement(data: Record<string, any>) {
    return this.fetchJson('/api/portal/admin/announcements', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
  }

  async updateAnnouncement(id: number, data: Record<string, any>) {
    return this.fetchJson(`/api/portal/admin/announcements/${id}`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(data),
    });
  }

  async deleteAnnouncement(id: number) {
    return this.fetchJson(`/api/portal/admin/announcements/${id}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  // ===== Chat endpoints =====

  async chat(message: string, conversationHistory: Array<{ role: string; content: string }> = [], includeDailyChallenge = true) {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ message, conversationHistory, includeDailyChallenge }),
    });
    await this.handleResponse(response);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Chat request failed');
    }
    return response.json();
  }

  // ===== Generic fetch helper for app-specific endpoints =====

  async fetchJson<T>(path: string, options?: RequestInit & { auth?: boolean }): Promise<T> {
    const { auth = false, ...fetchOptions } = options || {};
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: {
        ...this.getHeaders(auth),
        ...(fetchOptions.headers || {}),
      },
    });
    await this.handleResponse(response);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }
}

export const api = new ApiService();
