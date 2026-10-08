import type { Trip } from './models';

export function sortMyTrips<T extends Pick<Trip, 'startDate' | 'endDate'>>(trips: T[], today: string): T[] {
  return [...trips].sort((left, right) => {
    const leftEnded = left.endDate < today;
    const rightEnded = right.endDate < today;
    if (leftEnded !== rightEnded) return leftEnded ? 1 : -1;
    if (leftEnded) return right.endDate.localeCompare(left.endDate);
    return left.startDate.localeCompare(right.startDate);
  });
}
