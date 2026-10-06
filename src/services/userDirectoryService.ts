import type { UserDirectoryService } from '../domain/models';
import { requireSupabase } from './supabaseClient';

export class SupabaseUserDirectoryService implements UserDirectoryService {
  async lookupGoogleUser(email: string, tripId?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@gmail\.com$/.test(normalizedEmail)) {
      throw new Error('請輸入完整的 @gmail.com 地址。');
    }
    const { data, error } = await requireSupabase().rpc('lookup_google_user', {
      p_email: normalizedEmail,
      p_trip_id: tripId ?? null,
    });
    if (error) throw new Error(error.message);
    const row = data?.[0] as { id?: unknown; email?: unknown } | undefined;
    return row && typeof row.id === 'string' && typeof row.email === 'string'
      ? { id: row.id, email: row.email }
      : null;
  }
}

export const userDirectoryService = new SupabaseUserDirectoryService();