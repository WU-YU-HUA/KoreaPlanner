import { requireSupabase } from '../services/supabaseClient';

function requireLocalDev() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    throw new Error('This probe is available only on the local Vite development server.');
  }
}

/** Return only Trip IDs/names and the current user's role, never session credentials. */
export async function listTestTrips() {
  requireLocalDev();
  const client = requireSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError || !session) throw new Error('請先在此本機網站登入 Google。');
  const { data, error } = await client.from('trips').select('id,name,owner_id,co_worker_ids');
  if (error) throw new Error('無法讀取目前帳號的 Trip。');
  return (data ?? []).flatMap((trip) => {
    const role = trip.owner_id === session.user.id ? 'Owner'
      : Array.isArray(trip.co_worker_ids) && trip.co_worker_ids.includes(session.user.id) ? 'Co-Worker' : null;
    return role ? [{ tripId: trip.id as string, name: trip.name as string, role }] : [];
  });
}

/** One request only. No automatic retries or quota-exhaustion loop. */
export async function searchPlacesProbe(options: { tripId: string; query?: string; authenticated?: boolean }) {
  requireLocalDev();
  const client = requireSupabase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  if (options.authenticated !== false) {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) throw new Error('請先在此本機網站登入 Google。');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/search-places`, {
    method: 'POST', headers,
    body: JSON.stringify({ tripId: options.tripId, query: options.query ?? '명동 카페' }),
    signal: AbortSignal.timeout(15_000),
  });
  // Do not return raw payloads, headers, client objects, or tokens to the console.
  const payload: unknown = await response.json().catch(() => null);
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const reason = ['user_rate_limit', 'project_monthly_limit', 'quota_unavailable'].includes(String(body.reason))
    ? String(body.reason) : null;
  return {
    status: response.status,
    placeCount: Array.isArray(body.places) ? body.places.length : null,
    reason,
    monthlyRemaining: typeof body.monthlyRemaining === 'number' ? body.monthlyRemaining : null,
    userRemaining: typeof body.userRemaining === 'number' ? body.userRemaining : null,
    retryAfter: response.headers.get('Retry-After'),
  };
}
