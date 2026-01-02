/**
 * Utility functions for timezone-aware date handling
 */

/**
 * Get today's date in a specific timezone (YYYY-MM-DD format)
 * @param timezone IANA timezone identifier (e.g., 'America/New_York', 'America/Los_Angeles')
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  
  // Convert to the specified timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  
  return `${year}-${month}-${day}`;
}

/**
 * Convert a date to YYYY-MM-DD format in a specific timezone
 * @param date Date object to convert
 * @param timezone IANA timezone identifier
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  
  return `${year}-${month}-${day}`;
}

/**
 * Get the default timezone for server operations (scheduled tasks)
 * @returns IANA timezone identifier
 */
export function getServerTimezone(): string {
  return process.env.TIMEZONE || 'America/New_York';
}
