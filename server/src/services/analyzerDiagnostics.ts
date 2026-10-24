import { getProviderUsageRequestId } from './providerUsageService.js';

type DiagnosticKind = 'listings-query' | 'listings-response' | 'comp-selection' | 'property-type-schema';

export function recordAnalyzerDiagnostic(
  kind: DiagnosticKind, fields: Record<string, string | number | boolean | null>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.debug('[analyzer:diagnostic]', JSON.stringify({
    kind, requestId: getProviderUsageRequestId(), ...fields,
  }));
}
