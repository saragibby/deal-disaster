// Shared API service for all apps in the platform
// In production (same-origin), use ''. In dev, use localhost:3002.

const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const API_BASE_URL = isProduction ? '' : 'http://localhost:3002';

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

  async chatStream(
    message: string,
    conversationHistory: Array<{ role: string; content: string }> = [],
    includeDailyChallenge: boolean = true,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): Promise<AbortController> {
    const abortController = new AbortController();

    fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ message, conversationHistory, includeDailyChallenge }),
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          if (this.onUnauthorized) {
            this.onUnauthorized();
          }
          throw new Error('Session expired. Please login again.');
        }
        if (!response.ok) {
          throw new Error('Chat stream request failed');
        }
        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);

            if (data === '[DONE]') {
              onDone();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                onError(new Error(parsed.error));
                return;
              }
              if (parsed.content) {
                onChunk(parsed.content);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              onDone();
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) onChunk(parsed.content);
              } catch {
                // Skip
              }
              onDone();
            }
          }
        }

        onDone();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onError(err);
        }
      });

    return abortController;
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

  // ===== Property Data endpoints (general-purpose, reusable) =====

  async lookupProperty(params: { url?: string; zpid?: string; address?: string; city?: string; state?: string }) {
    return this.fetchJson<{ property: any }>('/api/property/lookup', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(params),
    });
  }

  async getRentalEstimate(params: { zpid?: string; price?: number; bedrooms?: number; sqft?: number; yearBuilt?: number; propertyType?: string }) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null) qs.set(k, String(v)); });
    return this.fetchJson<{ rentalEstimate: any }>(`/api/property/rental-estimate?${qs.toString()}`, { auth: true });
  }

  async runPropertyAnalysis(input: { url?: string; zpid?: string; property?: any; params?: Record<string, any> }) {
    return this.fetchJson<{ property: any; results: any; rentalEstimate: any }>('/api/property/analyze', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    });
  }

  async searchProperties(query: string) {
    return this.fetchJson<{ results: any[] }>(`/api/property/search?q=${encodeURIComponent(query)}`, { auth: true });
  }

  // ===== Property Analyzer endpoints (app-specific with history) =====

  async runAndSaveAnalysis(url: string, params?: Record<string, any>) {
    return this.fetchJson<any>('/api/analyzer/run', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ url, params }),
    });
  }

  async getAnalysisHistory(page = 1, limit = 20) {
    return this.fetchJson<{ analyses: any[]; total: number; page: number; limit: number }>(
      `/api/analyzer/history?page=${page}&limit=${limit}`,
      { auth: true },
    );
  }

  async getAnalysis(id: number) {
    return this.fetchJson<{ analysis: any }>(`/api/analyzer/history/${id}`, { auth: true });
  }

  async deleteAnalysis(id: number) {
    return this.fetchJson<{ success: boolean }>(`/api/analyzer/history/${id}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async reAnalyze(id: number, params: Record<string, any>) {
    return this.fetchJson<any>(`/api/analyzer/re-analyze/${id}`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ params }),
    });
  }
}

export const api = new ApiService();
