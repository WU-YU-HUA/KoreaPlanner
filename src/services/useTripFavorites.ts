import { useEffect, useRef, useState } from 'react';
import { repositories } from './repositories';

export function useTripFavorites(userId: string | undefined) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{
    userId?: string; ids: Set<string>; pending: Set<string>; loading: boolean; ready: boolean; error: string;
  }>({ ids: new Set(), pending: new Set(), loading: false, ready: false, error: '' });
  const session = useRef({ active: false, pending: new Set<string>() });

  useEffect(() => {
    const current = { active: true, pending: new Set<string>() };
    session.current = current;
    setState({ userId, ids: new Set(), pending: new Set(), loading: Boolean(userId), ready: false, error: '' });
    if (userId) {
      repositories.favorite.getTripIds(userId).then((ids) => {
        if (current.active) setState((previous) => ({ ...previous, ids: new Set(ids), loading: false, ready: true }));
      }).catch((error: unknown) => {
        if (current.active) setState((previous) => ({ ...previous, loading: false,
          error: error instanceof Error ? error.message : '讀取收藏失敗。' }));
      });
    }
    return () => { current.active = false; };
  }, [userId, reload]);

  const visible = state.userId === userId ? state : {
    ids: new Set<string>(), pending: new Set<string>(), loading: Boolean(userId), ready: false, error: '',
  };

  async function toggle(tripId: string) {
    const current = session.current;
    if (!userId || !current.active || !visible.ready || visible.loading || current.pending.size) return;
    const wasFavorite = visible.ids.has(tripId);
    current.pending.add(tripId);
    setState((previous) => ({ ...previous, pending: new Set(current.pending), error: '' }));
    try {
      if (wasFavorite) await repositories.favorite.remove(userId, tripId);
      else await repositories.favorite.add(userId, tripId);
      // Fetch the database order after adding; its created_at is authoritative.
      const orderedIds = wasFavorite ? undefined : await repositories.favorite.getTripIds(userId);
      if (current.active) setState((previous) => {
        const ids = new Set(orderedIds ?? previous.ids);
        if (wasFavorite) ids.delete(tripId);
        return { ...previous, ids };
      });
    } catch (error: unknown) {
      if (current.active) setState((previous) => ({ ...previous,
        error: error instanceof Error ? error.message : '更新收藏失敗。' }));
    } finally {
      current.pending.delete(tripId);
      if (current.active) setState((previous) => ({ ...previous, pending: new Set(current.pending) }));
    }
  }

  return { ...visible, toggle, retry: () => setReload((value) => value + 1) };
}
