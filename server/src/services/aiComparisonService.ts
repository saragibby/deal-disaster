import OpenAI from 'openai';
import type { PropertyAnalysis } from '@deal-platform/shared-types';

let client: OpenAI | null = null;
let deploymentName: string = '';

function getClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

  if (!apiKey || !endpoint) {
    throw new Error('Azure OpenAI credentials not configured. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
  }

  const cleanEndpoint = endpoint.replace(/\/api\/projects.*$/, '').replace(/\/$/, '');

  client = new OpenAI({
    apiKey,
    baseURL: `${cleanEndpoint}/openai/deployments/${deploymentName}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': apiKey },
  });

  return client;
}

/** Build a concise financial snapshot for the AI prompt. */
function buildPropertySnapshot(p: PropertyAnalysis): string {
  const prop = p.property_data;
  const cf = p.analysis_results?.cashFlow;
  const roi = p.analysis_results?.roi;
  const ts = p.analysis_results?.taxSavings;
  const str = p.analysis_results?.strEstimate;
  const rent = p.analysis_results?.rentalEstimate;

  return [
    `Property #${p.id}: ${prop.address}`,
    `  Price: $${prop.price.toLocaleString()} | Zestimate: $${(prop.zestimate || 0).toLocaleString()}`,
    `  ${prop.bedrooms}bd/${prop.bathrooms}ba | ${(prop.sqft || 0).toLocaleString()} sqft | Built ${prop.yearBuilt || 'N/A'}`,
    `  Monthly Rent: $${(cf?.monthlyRent || 0).toLocaleString()} | Confidence: ${rent?.confidence || 'N/A'}`,
    `  Monthly Cash Flow: $${(cf?.monthlyCashFlow || 0).toLocaleString()} | Annual: $${(cf?.annualCashFlow || 0).toLocaleString()}`,
    `  Expenses: Mortgage $${(cf?.monthlyMortgage || 0).toLocaleString()}, Tax $${(cf?.monthlyTax || 0).toLocaleString()}, Insurance $${(cf?.monthlyInsurance || 0).toLocaleString()}`,
    `  CoC ROI: ${(roi?.cashOnCashROI || 0).toFixed(2)}% | Cap Rate: ${(roi?.capRate || 0).toFixed(2)}% | GRM: ${(roi?.grossRentMultiplier || 0).toFixed(1)}`,
    `  Total Cash Invested: $${(roi?.totalCashInvested || 0).toLocaleString()}`,
    `  Tax Savings: $${(ts?.taxSavings || 0).toLocaleString()} | Eff. Return: ${(ts?.effectiveFirstYearReturn || 0).toFixed(2)}%`,
    str ? `  STR: $${str.nightlyRate}/night, ${(str.occupancyRate * 100).toFixed(0)}% occupancy, $${str.netMonthlyRevenue.toLocaleString()}/mo net` : '  STR: No data',
  ].join('\n');
}

/**
 * Generate a 3-5 sentence comparison summary across all properties.
 */
export async function generateComparisonSummary(
  properties: PropertyAnalysis[],
): Promise<string> {
  const openai = getClient();

  const snapshots = properties.map(buildPropertySnapshot).join('\n\n');

  const response = await openai.chat.completions.create({
    model: deploymentName,
    messages: [
      {
        role: 'system',
        content: `You are an expert real estate investment analyst. Provide concise, actionable comparisons for investors. Use plain language, no markdown. Focus on which property is the strongest investment and why, key tradeoffs, and risks to watch. Keep it to 3-5 sentences.`,
      },
      {
        role: 'user',
        content: `Compare these ${properties.length} investment properties and give me a concise summary of which is the best deal and why:\n\n${snapshots}`,
      },
    ],
    max_completion_tokens: 16000,
  });

  console.log('[AI comparison-summary] Response:', JSON.stringify(response, null, 2));

  const choice = response.choices[0];
  const content = choice?.message?.content?.trim();

  if (!content) {
    console.error('[AI comparison-summary] Empty content from model.', {
      finishReason: choice?.finish_reason,
      usage: response.usage,
      refusal: choice?.message?.refusal,
    });
    throw new Error(
      `AI returned empty response (finish_reason: ${choice?.finish_reason}, ` +
      `prompt_tokens: ${response.usage?.prompt_tokens}, ` +
      `completion_tokens: ${response.usage?.completion_tokens})`
    );
  }

  return content;
}

/**
 * Generate per-property investment narratives in a single batch call.
 */
export async function generatePropertyNarratives(
  properties: PropertyAnalysis[],
): Promise<Array<{ propertyId: number; address: string; narrative: string }>> {
  const openai = getClient();

  const snapshots = properties.map(buildPropertySnapshot).join('\n\n');

  const response = await openai.chat.completions.create({
    model: deploymentName,
    messages: [
      {
        role: 'system',
        content: `You are an expert real estate investment analyst. For each property provided, write a 2-3 sentence investment assessment in plain English. Cover cash flow quality, ROI attractiveness, any STR potential, and notable risks. Return ONLY a JSON array of objects with "propertyId" (number) and "narrative" (string). No markdown fences, just raw JSON.`,
      },
      {
        role: 'user',
        content: `Write individual investment narratives for each of these properties:\n\n${snapshots}`,
      },
    ],
    max_completion_tokens: 16000,
  });

  console.log('[AI property-narratives] Response:', JSON.stringify(response, null, 2));

  const narChoice = response.choices[0];
  const raw = narChoice?.message?.content?.trim();

  if (!raw) {
    console.error('[AI property-narratives] Empty content from model.', {
      finishReason: narChoice?.finish_reason,
      usage: response.usage,
      refusal: narChoice?.message?.refusal,
    });
    throw new Error(
      `AI returned empty response (finish_reason: ${narChoice?.finish_reason}, ` +
      `completion_tokens: ${response.usage?.completion_tokens})`
    );
  }

  try {
    const parsed: Array<{ propertyId: number; narrative: string }> = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected array');
    return parsed.map((item) => {
      const prop = properties.find(p => p.id === item.propertyId);
      return {
        propertyId: item.propertyId,
        address: prop?.property_data.address || 'Unknown',
        narrative: typeof item.narrative === 'string' ? item.narrative : '',
      };
    });
  } catch {
    // Fallback: return the entire response as a single narrative for the first property
    return properties.map(p => ({
      propertyId: p.id,
      address: p.property_data.address,
      narrative: '',
    }));
  }
}
