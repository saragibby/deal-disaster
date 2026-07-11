import type {
  AIComparisonNarratives,
  AIComparisonSummary,
  AnalyzerApiClient,
  AnalyzerShareState,
  PageInput,
  PagedResult,
  PropertyAnalysis,
  RunAnalysisInput,
  SavedComparison,
  SaveAdjustmentsPayload,
  AnalysisParams,
} from '@deal-platform/shared-types';
import { api } from './ApiService';
import type { ApiService } from './ApiService';

interface AnalysisHistoryResponse {
  analyses: PropertyAnalysis[];
  total: number;
  page: number;
  limit: number;
}

interface SavedComparisonsResponse {
  comparisons: SavedComparison[];
  total: number;
  page: number;
  limit: number;
}

const pageDefaults = (input: PageInput = {}) => ({
  page: input.page ?? 1,
  limit: input.limit ?? 20,
});

const toPagedResult = <T>(
  items: T[],
  response: Pick<PagedResult<T>, 'total' | 'page' | 'limit'>,
): PagedResult<T> => ({
  items,
  total: response.total,
  page: response.page,
  limit: response.limit,
});

export function createAnalyzerApiClient(apiService: ApiService): AnalyzerApiClient {
  return {
    runAnalysis(input: RunAnalysisInput) {
      return apiService.fetchJson<PropertyAnalysis>('/api/analyzer/run', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ url: input.url, params: input.params }),
      });
    },

    async getHistory(input: PageInput = {}) {
      const { page, limit } = pageDefaults(input);
      const response = await apiService.fetchJson<AnalysisHistoryResponse>(
        `/api/analyzer/history?page=${page}&limit=${limit}`,
        { auth: true },
      );
      return toPagedResult(response.analyses, response);
    },

    async getAnalysis(slug: string) {
      const response = await apiService.fetchJson<{ analysis: PropertyAnalysis }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}`,
        { auth: true },
      );
      return response.analysis;
    },

    async deleteAnalysis(slug: string) {
      await apiService.fetchJson<{ success: boolean }>(`/api/analyzer/history/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        auth: true,
      });
    },

    reAnalyze(slug: string, params: Partial<AnalysisParams>) {
      return apiService.fetchJson<PropertyAnalysis>(`/api/analyzer/re-analyze/${encodeURIComponent(slug)}`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ params }),
      });
    },

    async saveAdjustments(slug: string, payload: SaveAdjustmentsPayload) {
      await apiService.fetchJson<{ success: boolean }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/overrides`,
        { method: 'PATCH', auth: true, body: JSON.stringify(payload) },
      );
    },

    async setShared(slug: string, shared: boolean) {
      const response = await apiService.fetchJson<{ slug: string; is_shared: boolean }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/share`,
        { method: 'PATCH', auth: true, body: JSON.stringify({ shared }) },
      );
      return {
        slug: response.slug,
        isShared: response.is_shared,
      } satisfies AnalyzerShareState;
    },

    async getSharedAnalysis(slug: string) {
      const response = await apiService.fetchJson<{ analysis: PropertyAnalysis }>(
        `/api/analyzer/shared/${encodeURIComponent(slug)}`,
      );
      return response.analysis;
    },

    async saveComparison(name: string, propertySlugs: string[]) {
      const response = await apiService.fetchJson<{ comparison: SavedComparison }>('/api/comparisons', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ name, propertySlugs }),
      });
      return response.comparison;
    },

    async getSavedComparisons(input: PageInput = {}) {
      const { page, limit } = pageDefaults(input);
      const response = await apiService.fetchJson<SavedComparisonsResponse>(
        `/api/comparisons?page=${page}&limit=${limit}`,
        { auth: true },
      );
      return toPagedResult(response.comparisons, response);
    },

    async getSavedComparison(id: number) {
      const response = await apiService.fetchJson<{ comparison: SavedComparison }>(
        `/api/comparisons/${id}`,
        { auth: true },
      );
      return response.comparison;
    },

    async updateComparisonSlugs(id: number, propertySlugs: string[]) {
      const response = await apiService.fetchJson<{ comparison: SavedComparison }>(`/api/comparisons/${id}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ propertySlugs }),
      });
      return response.comparison;
    },

    async deleteSavedComparison(id: number) {
      await apiService.fetchJson<{ success: boolean }>(`/api/comparisons/${id}`, {
        method: 'DELETE',
        auth: true,
      });
    },

    getComparisonSummary(propertySlugs: string[]) {
      return apiService.fetchJson<AIComparisonSummary>('/api/ai/comparison-summary', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ propertySlugs }),
      });
    },

    async getPropertyNarratives(propertySlugs: string[]) {
      const response = await apiService.fetchJson<AIComparisonNarratives>('/api/ai/property-narratives', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ propertySlugs }),
      });
      return response.narratives;
    },

    searchForeclosures(params) {
      return apiService.searchForeclosures(params);
    },

    getMarketTrends(postalCode) {
      return apiService.getMarketTrends(postalCode);
    },

    submitFeedback(message) {
      return apiService.submitFeedback(message);
    },
  };
}

export const analyzerApi = createAnalyzerApiClient(api);
export type { AnalyzerApiClient };
