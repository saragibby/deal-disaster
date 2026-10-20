import type { Pool } from 'pg';
import type { Geocoordinates } from './geocodingService.js';

export type GeocodingProvider = 'google' | 'census' | 'nominatim';
export interface GeocodingCacheWrite {
  key: string;
  coords: Geocoordinates;
  address: string;
  provider: GeocodingProvider;
}

export function createPostgresGeocodingCache(db: Pick<Pool, 'query'>) {
  const prefix = 'osm:v1:';
  return {
    async lookup(keys: string[]): Promise<Map<string, Geocoordinates>> {
      if (keys.length === 0) return new Map();
      const queryKeys = [...keys, ...keys.map(key => `${prefix}${key}`)];
      const placeholders = queryKeys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await db.query<{
        address_key: string; latitude: number; longitude: number;
        provider: GeocodingProvider; created_at: Date | null;
      }>(
        `SELECT address_key, latitude, longitude, provider, created_at FROM geocoding_cache
         WHERE address_key IN (${placeholders})
           AND provider IN ('census', 'nominatim')
         ORDER BY (left(address_key, 7) = 'osm:v1:')`,
        queryKeys,
      );
      return new Map(rows.map(row => [row.address_key.startsWith(prefix)
        ? row.address_key.slice(prefix.length) : row.address_key, {
        lat: row.latitude, lng: row.longitude, coordinateSource: row.provider,
        ...(row.created_at ? { coordinatesObservedAt: row.created_at.toISOString() } : {}),
      }]));
    },
    async store(entries: GeocodingCacheWrite[]): Promise<void> {
      if (entries.length === 0) return;
      if (entries.some(entry => entry.provider !== 'census' && entry.provider !== 'nominatim')) {
        throw new Error('Google geocoding cache writes are disabled for OpenStreetMap');
      }
      const values: Array<string | number> = [];
      const placeholders = entries.map((entry, i) => {
        values.push(`${prefix}${entry.key}`,
          entry.coords.lat, entry.coords.lng, entry.address, entry.provider);
        return `(${Array.from({ length: 5 }, (_, n) => `$${i * 5 + n + 1}`).join(', ')}, clock_timestamp())`;
      });
      await db.query(
        `INSERT INTO geocoding_cache (address_key, latitude, longitude, formatted_address, provider, created_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (address_key) DO UPDATE SET
           latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
           formatted_address = EXCLUDED.formatted_address, provider = EXCLUDED.provider,
           created_at = EXCLUDED.created_at
         WHERE geocoding_cache.provider IN ('census', 'nominatim')`,
        values,
      );
    },
  };
}
