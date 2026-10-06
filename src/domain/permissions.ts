import type { Trip } from './models';

export function canManageTrip(userId: string | undefined, trip: Trip): boolean {
  return Boolean(userId && userId === trip.ownerId);
}

export function canManageSchedule(userId: string | undefined, trip: Trip): boolean {
  return Boolean(userId && (userId === trip.ownerId || trip.coWorkerIds.includes(userId)));
}