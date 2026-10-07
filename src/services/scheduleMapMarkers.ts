import type { Coordinates, Schedule } from '../domain/models';
import { isValidCoordinates, sortSchedules } from '../domain/validation';

export interface ScheduleMapEntry {
  schedule: Schedule;
  number?: number;
  time: string;
}
export interface ScheduleMapMarker extends Coordinates {
  entries: ScheduleMapEntry[];
  label: string;
  pending: boolean;
}

export function scheduleTimeLabel(schedule: Pick<Schedule, 'startTime' | 'endTime'>): string {
  if (!schedule.startTime) return '待定';
  return `${schedule.startTime} ~${schedule.endTime ? ` ${schedule.endTime}` : ''}`;
}

export function buildScheduleMapMarkers(schedules: Schedule[]): ScheduleMapMarker[] {
  const groups = new Map<string, ScheduleMapMarker>();
  sortSchedules(schedules).forEach((schedule, index) => {
    const place = schedule.place;
    // Assign sequence before filtering coordinates to keep gaps consistent with the list.
    if (!isValidCoordinates(place)) return;
    const key = `${place.latitude},${place.longitude}`;
    let group = groups.get(key);
    if (!group) {
      group = { latitude: place.latitude, longitude: place.longitude, entries: [], label: '', pending: true };
      groups.set(key, group);
    }
    const number = schedule.startTime ? index + 1 : undefined;
    group.entries.push({ schedule, number, time: scheduleTimeLabel(schedule) });
    if (number !== undefined) group.pending = false;
  });
  for (const group of groups.values()) {
    group.label = group.entries.length <= 3
      ? group.entries.map(entry => entry.number ?? '?').join('/')
      : group.pending ? '?' : '';
  }
  return [...groups.values()];
}
