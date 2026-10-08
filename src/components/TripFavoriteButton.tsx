import type { useTripFavorites } from '../services/useTripFavorites';

export default function TripFavoriteButton({ tripId, tripName, favorites }: {
  tripId: string;
  tripName: string;
  favorites: ReturnType<typeof useTripFavorites>;
}) {
  const selected = favorites.ids.has(tripId);
  return (
    <button type="button" className="icon-button trip-favorite-button"
      aria-pressed={selected} aria-label={`${selected ? '取消收藏' : '收藏'} ${tripName}`}
      disabled={!favorites.ready || favorites.loading || favorites.pending.size > 0}
      onClick={() => void favorites.toggle(tripId)}>
      <span aria-hidden="true">{selected ? '★' : '☆'}</span> {selected ? '已收藏' : '收藏'}
    </button>
  );
}
