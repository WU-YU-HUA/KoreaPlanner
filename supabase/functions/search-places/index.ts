import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import {
  buildTextSearchRequest,
  GOOGLE_PLACES_FIELD_MASK,
  mapGooglePlacesResponse,
  parseSearchPlacesInput,
} from './core.ts';

const GOOGLE_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const REQUEST_TIMEOUT_MS = 8_000;
const allowedOrigins = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function getCorsHeaders(request: Request) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });
  const origin = request.headers.get('origin');
  const allowed = !origin || allowedOrigins.has(origin);
  if (origin && allowed) headers.set('Access-Control-Allow-Origin', origin);
  return { headers, allowed };
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  corsHeaders: Headers,
  extraHeaders?: Record<string, string>,
) {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  Object.entries(extraHeaders ?? {}).forEach(([name, value]) => headers.set(name, value));
  return new Response(JSON.stringify(body), { status, headers });
}

function hasGoogleIdentity(user: {
  identities?: Array<{ provider: string }> | null;
  app_metadata?: { provider?: unknown; providers?: unknown };
}) {
  const providers = user.app_metadata?.providers;
  return user.app_metadata?.provider === 'google'
    || (Array.isArray(providers) && providers.includes('google'))
    || Boolean(user.identities?.some((identity) => identity.provider === 'google'));
}

async function handleSearchRequest(request: Request) {
  const { headers: corsHeaders, allowed: originAllowed } = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: originAllowed ? 204 : 403, headers: corsHeaders });
  }
  if (!originAllowed) return jsonResponse(403, { error: 'Origin is not allowed.' }, corsHeaders);
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Only POST is supported.' }, corsHeaders, { Allow: 'POST, OPTIONS' });
  }

  const authorization = request.headers.get('Authorization');
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) return jsonResponse(401, { error: 'A Google-authenticated session is required.' }, corsHeaders);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !googleApiKey) {
    return jsonResponse(500, { error: 'The search service is not configured.' }, corsHeaders);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearerMatch[1]}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearerMatch[1]);
  if (authError || !authData.user) {
    return jsonResponse(401, { error: 'The session is invalid or expired.' }, corsHeaders);
  }
  if (!hasGoogleIdentity(authData.user)) {
    return jsonResponse(403, { error: 'A Google-authenticated account is required.' }, corsHeaders);
  }

  let input: ReturnType<typeof parseSearchPlacesInput>;
  try {
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > 8_192) return jsonResponse(413, { error: 'Request body is too large.' }, corsHeaders);
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 8_192) {
      return jsonResponse(413, { error: 'Request body is too large.' }, corsHeaders);
    }
    input = parseSearchPlacesInput(JSON.parse(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON request body.';
    return jsonResponse(400, { error: message }, corsHeaders);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: reservations, error: reservationError } = await serviceClient.rpc(
    'reserve_google_places_search',
    { p_user_id: authData.user.id, p_trip_id: input.tripId },
  );
  if (reservationError) {
    if (reservationError.code === '42501') {
      return jsonResponse(403, { error: 'Google account and Owner/Co-Worker Trip access are required.' }, corsHeaders);
    }
    if (reservationError.code === 'P0002') {
      return jsonResponse(404, { error: 'Trip not found.' }, corsHeaders);
    }
    return jsonResponse(503, { error: 'Search quota reservation failed; no Google request was sent.' }, corsHeaders);
  }

  const reservation = Array.isArray(reservations) ? reservations[0] : null;
  if (!reservation || reservation.allowed !== true) {
    const isUserLimited = reservation?.reason === 'user_rate_limit';
    const retryAfter = Number.isInteger(reservation?.retry_after_seconds)
      ? Math.max(1, reservation.retry_after_seconds as number)
      : 60;
    return jsonResponse(429, {
      error: isUserLimited
        ? 'Search rate limit reached. Please try again shortly.'
        : 'The project monthly Google Places request limit has been reached.',
      reason: reservation?.reason ?? 'quota_unavailable',
      monthlyRemaining: reservation?.monthly_remaining ?? 0,
      userRemaining: reservation?.user_remaining ?? 0,
    }, corsHeaders, { 'Retry-After': String(retryAfter) });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let googleResponse: Response;
  try {
    googleResponse = await fetch(GOOGLE_TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify(buildTextSearchRequest(input.query)),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
      return jsonResponse(504, { error: 'Google Places search timed out.' }, corsHeaders);
    }
    return jsonResponse(502, { error: 'Could not reach Google Places.' }, corsHeaders);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!googleResponse.ok) {
    const status = googleResponse.status === 429 ? 503 : 502;
    return jsonResponse(status, { error: 'Google Places rejected the search request.' }, corsHeaders);
  }

  let googlePayload: unknown;
  try {
    googlePayload = await googleResponse.json();
  } catch {
    return jsonResponse(502, { error: 'Google Places returned an invalid response.' }, corsHeaders);
  }

  return jsonResponse(200, {
    places: mapGooglePlacesResponse(googlePayload),
  }, corsHeaders);
}

Deno.serve((request: Request) => handleSearchRequest(request).catch(() => {
  const { headers } = getCorsHeaders(request);
  return jsonResponse(500, { error: 'Unexpected search service error.' }, headers);
}));
