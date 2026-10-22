import type {
  AIComparisonNarratives,
  AIComparisonSummary,
  AnalyzerApiClient,
  AnalyzerShareState,
  PageInput,
  PagedResult,
  PropertyAnalysis,
  PropertyRecords,
  RunAnalysisInput,
  SavedComparison,
  SaveAdjustmentsPayload,
  AnalysisParams,
  AnalysisScenario,
  AnalysisScenarioInput,
  MTREstimate,
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

    getPropertyRecords(slug: string) {
      return apiService.fetchJson<PropertyRecords>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/property-records`,
        { auth: true },
      );
    },

    refreshPropertyRecords(slug: string) {
      return apiService.fetchJson<PropertyRecords>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/property-records/refresh`,
        { method: 'POST', auth: true },
      );
    },

    async getScenarios(slug: string) {
      const response = await apiService.fetchJson<{ scenarios: AnalysisScenario[] }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/scenarios`, { auth: true },
      );
      return response.scenarios;
    },
    async saveScenario(slug: string, input: AnalysisScenarioInput) {
      const response = await apiService.fetchJson<{ scenario: AnalysisScenario }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/scenarios`,
        { auth: true, method: 'POST', body: JSON.stringify(input) },
      );
      return response.scenario;
    },
    async deleteScenario(slug: string, id: number) {
      await apiService.fetchJson<{ success: boolean }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/scenarios/${id}`, { auth: true, method: 'DELETE' },
      );
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

    async refreshMissingData(slug: string) {
      const response = await apiService.fetchJson<{ analysis: PropertyAnalysis }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/refresh-missing`,
        { method: 'POST', auth: true },
      );
      return response.analysis;
    },

    loadMtrNearby(slug: string) {
      return apiService.fetchJson<MTREstimate>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/mtr-nearby`,
        { method: 'POST', auth: true },
      );
    },

    async saveAdjustments(slug: string, payload: SaveAdjustmentsPayload) {
      await apiService.fetchJson<{ success: boolean }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/overrides`,
        { method: 'PATCH', auth: true, body: JSON.stringify(payload) },
      );
    },

    async setShared(slug: string, shared: boolean) {
      const response = await apiService.fetchJson<{ slug: string; is_shared: boolean; public_share_id: string | null }>(
        `/api/analyzer/history/${encodeURIComponent(slug)}/share`,
        { method: 'PATCH', auth: true, body: JSON.stringify({ shared }) },
      );
      return {
        slug: response.slug,
        isShared: response.is_shared,
        publicShareId: response.public_share_id,
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
