/**
 * Property Input Resolver
 *
 * Accepts any user input — a property URL (Zillow, Redfin, Realtor.com,
 * Trulia) or a plain address — and resolves it into a PropertyData object
 * using the appropriate lookup strategy.
 *
 * Zillow URLs use the fast ZPID path; everything else resolves via address.
 */

import type { PropertyData } from '@deal-platform/shared-types';
import {
  parseZillowUrl,
  getPropertyByZpid,
  getPropertyByAddress,
} from './propertyDataService.js';

export type PropertySource = 'zillow' | 'redfin' | 'realtor' | 'trulia' | 'address';

export interface ResolvedProperty {
  property: PropertyData;
  source: PropertySource;
  sourceUrl?: string;
}

// ---------- URL detection ----------

function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

function detectSource(input: string): PropertySource {
  const lower = input.toLowerCase();
  if (lower.includes('zillow.com')) return 'zillow';
  if (lower.includes('redfin.com')) return 'redfin';
  if (lower.includes('realtor.com')) return 'realtor';
  if (lower.includes('trulia.com')) return 'trulia';
  if (isUrl(input)) return 'address'; // unknown URL — try parsing as address
  return 'address';
}

// ---------- Address extraction from URL slugs ----------

/**
 * Redfin URLs follow the pattern:
 *   /STATE/CITY/ADDRESS/home/ID
 * e.g. /FL/Miami/123-Main-St/home/12345678
 */
function parseRedfinUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    // Match: /STATE/CITY/ADDRESS/home/ID
    const match = path.match(/^\/([A-Za-z-]+)\/([A-Za-z-]+)\/([A-Za-z0-9-]+)\/home\//);
    if (match) {
      const state = match[1].replace(/-/g, ' ');
      const city = match[2].replace(/-/g, ' ');
      const street = match[3].replace(/-/g, ' ');
      return `${street}, ${city}, ${state}`;
    }
  } catch { /* fall through */ }
  throw new Error('Could not extract address from this Redfin URL. Try pasting the property address instead.');
}

/**
 * Realtor.com URLs follow the pattern:
 *   /realestateandhomes-detail/STREET_CITY_STATE_ZIP/...
 *   /realestateandhomes-detail/M1234-56789  (MLS ID variant)
 * e.g. /realestateandhomes-detail/123-Main-St_Miami_FL_33101/...
 */
function parseRealtorUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\/realestateandhomes-detail\/([^/]+)/);
    if (match) {
      const slug = match[1];
      // MLS-only slugs (e.g., M1234-56789) can't be parsed to an address
      if (/^M\d/i.test(slug)) {
        throw new Error('This Realtor.com URL uses an MLS ID instead of an address. Try pasting the property address instead.');
      }
      // Replace underscores with commas/spaces: "123-Main-St_Miami_FL_33101" → "123 Main St, Miami, FL 33101"
      const parts = slug.split('_');
      if (parts.length >= 3) {
        const street = parts[0].replace(/-/g, ' ');
        const city = parts[1].replace(/-/g, ' ');
        const stateZip = parts.slice(2).join(' ').replace(/-/g, ' ');
        return `${street}, ${city}, ${stateZip}`;
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('MLS ID')) throw e;
  }
  throw new Error('Could not extract address from this Realtor.com URL. Try pasting the property address instead.');
}

/**
 * Trulia URLs follow the pattern:
 *   /home/ADDRESS-CITY-STATE-ZIP-ID
 *   /p/STATE/CITY/ADDRESS/ID
 * e.g. /p/fl/miami/123-main-st/12345678
 */
function parseTruliaUrl(url: string): string {
  try {
    const path = new URL(url).pathname;

    // Format: /p/STATE/CITY/ADDRESS/ID
    const pMatch = path.match(/^\/p\/([^/]+)\/([^/]+)\/([^/]+)/);
    if (pMatch) {
      const state = pMatch[1].replace(/-/g, ' ');
      const city = pMatch[2].replace(/-/g, ' ');
      const street = pMatch[3].replace(/-/g, ' ');
      return `${street}, ${city}, ${state}`;
    }

    // Format: /home/ADDRESS-CITY-STATE-ZIP-ID
    const homeMatch = path.match(/^\/home\/(.+)/);
    if (homeMatch) {
      // Last segment is the ID, the rest is hyphenated address
      const slug = homeMatch[1];
      // Remove trailing numeric ID
      const cleaned = slug.replace(/-\d+$/, '');
      return cleaned.replace(/-/g, ' ');
    }
  } catch { /* fall through */ }
  throw new Error('Could not extract address from this Trulia URL. Try pasting the property address instead.');
}

// ---------- Main resolver ----------

/**
 * Resolve any user input (URL or address) into a PropertyData object.
 */
export async function resolvePropertyInput(input: string): Promise<ResolvedProperty> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Please enter a property address or URL.');
  }

  const source = detectSource(trimmed);

  switch (source) {
    case 'zillow': {
      const zpid = parseZillowUrl(trimmed);
      const property = await getPropertyByZpid(zpid);
      return { property, source, sourceUrl: trimmed };
    }

    case 'redfin': {
      const address = parseRedfinUrl(trimmed);
      const property = await getPropertyByAddress(address);
      return { property, source, sourceUrl: trimmed };
    }

    case 'realtor': {
      const address = parseRealtorUrl(trimmed);
      const property = await getPropertyByAddress(address);
      return { property, source, sourceUrl: trimmed };
    }

    case 'trulia': {
      const address = parseTruliaUrl(trimmed);
      const property = await getPropertyByAddress(address);
      return { property, source, sourceUrl: trimmed };
    }

    case 'address':
    default: {
      // Plain address or unrecognized URL — try address lookup
      const query = isUrl(trimmed) ? extractAddressFromGenericUrl(trimmed) : trimmed;
      const property = await getPropertyByAddress(query);
      return { property, source: 'address', sourceUrl: isUrl(trimmed) ? trimmed : undefined };
    }
  }
}

/**
 * Best-effort address extraction from an unknown property URL.
 * Falls back to the full URL path as a search query.
 */
function extractAddressFromGenericUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    // Strip leading/trailing slashes, replace hyphens/underscores with spaces
    return path.replace(/^\/|\/$/g, '').replace(/[/_-]/g, ' ').trim();
  } catch {
    return url;
  }
}
