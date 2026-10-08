import type { Trip } from './models';

/** Favorite IDs arrive in descending mapping created_at order. */
export function getFavoriteTrips<T extends Pick<Trip, 'id'>>(trips: T[], orderedIds: Iterable<string>): T[] {
  const byId = new Map(trips.map((trip) => [trip.id, trip]));
  return Array.from(orderedIds).flatMap((id) => {
    const trip = byId.get(id);
    return trip ? [trip] : [];
  });
}

export function sortMyTrips<T extends Pick<Trip, 'startDate' | 'endDate'>>(trips: T[], today: string): T[] {
  return [...trips].sort((left, right) => {
    const leftEnded = left.endDate < today;
    const rightEnded = right.endDate < today;
    if (leftEnded !== rightEnded) return leftEnded ? 1 : -1;
    if (leftEnded) return right.endDate.localeCompare(left.endDate);
    return left.startDate.localeCompare(right.startDate);
  });
}
