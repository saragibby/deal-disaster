/**
 * Generate a deterministic, human-readable slug from a property address + zip.
 * Format: {street-number}-{street-words}-{zip}
 * Examples: "24092-sawgrass-dr-37128", "521-5th-st-90210"
 *
 * The same address + zip always produces the same slug, so re-analysing a
 * property hits the same URL.  Uniqueness is enforced per-user in the DB
 * via UNIQUE(user_id, slug).
 */
export function generatePropertySlug(address: string, zip: string): string {
  // Normalise: lowercase, strip unit/apt suffixes, collapse whitespace
  const cleaned = address
    .toLowerCase()
    .replace(/[,#.]/g, ' ')
    .replace(/\b(apt|unit|suite|ste|bldg|fl|floor)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into tokens and take the leading street portion (number + street name)
  const tokens = cleaned.split(' ').filter(Boolean);

  // Common street-type abbreviations
  const abbrevMap: Record<string, string> = {
    street: 'st', avenue: 'ave', boulevard: 'blvd', drive: 'dr',
    road: 'rd', lane: 'ln', court: 'ct', circle: 'cir',
    place: 'pl', way: 'wy', terrace: 'ter', trail: 'trl',
    parkway: 'pkwy', highway: 'hwy', pike: 'pk',
  };

  // Abbreviate street type tokens
  const abbreviated = tokens.map(t => abbrevMap[t] || t);

  // Take up to 4 tokens from the address (typically: number + 1-3 street words)
  const addressPart = abbreviated.slice(0, 4).join('-');

  // Append the zip code for uniqueness
  const cleanZip = (zip || '').replace(/\D/g, '').slice(0, 5) || '00000';

  return `${addressPart}-${cleanZip}`;
}
