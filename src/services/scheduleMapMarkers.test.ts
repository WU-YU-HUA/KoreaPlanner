import { describe, expect, it } from 'vitest';
import type { Schedule } from '../domain/models';
import { buildScheduleMapMarkers, scheduleTimeLabel } from './scheduleMapMarkers';
const make = (id: string, time?: string, createdAt = id, latitude = 25): Schedule => ({ id, tripId: 'trip', date: '2026-10-07', name: id, startTime: time, createdAt, updatedAt: '', place: { provider: 'manual', name: id, latitude, longitude: 121 } });
describe('schedule map markers', () => {
  it('orders by start time then creation time, without mutating input', () => {
    const input = [make('late', '18:00'), make('b', '14:00', '2026-01-02', 26), make('a', '14:00', '2026-01-01', 27)];
    expect(buildScheduleMapMarkers(input).flatMap(group => group.entries.map(entry => [entry.schedule.id, entry.number]))).toEqual([['a', 1], ['b', 2], ['late', 3]]);
    expect(input[0].id).toBe('late');
  });
  it('retains sequence gaps for invalid coordinates', () => {
    expect(buildScheduleMapMarkers([make('invalid', '09:00', '', NaN), make('valid', '10:00')])[0].label).toBe('2');
  });
  it('groups repeat visits at the same coordinates and lists up to three numbers', () => {
    expect(buildScheduleMapMarkers([make('a', '09:00'), make('b', '10:00', '', 26), make('c', '11:00')])[0].label).toBe('1/3');
    const group = buildScheduleMapMarkers([make('a', '09:00'), make('b', '10:00'), make('c', '11:00'), make('d', '12:00')])[0];
    expect(group.label).toBe('');
    expect(group.entries.map(entry => entry.number)).toEqual([1, 2, 3, 4]);
  });
  it('marks unscheduled visits pending without assigning a sequence', () => {
    const group = buildScheduleMapMarkers([make('pending')])[0];
    expect(group).toMatchObject({ pending: true, label: '?', entries: [{ number: undefined, time: '待定' }] });
    const mixed = buildScheduleMapMarkers([make('pending'), make('timed', '14:00')])[0];
    expect(mixed).toMatchObject({ pending: false, label: '1/?' });
  });
  it('formats full and open-ended time ranges, treating missing start as pending', () => {
    expect(scheduleTimeLabel({ startTime: '14:00', endTime: '18:00' })).toBe('14:00 ~ 18:00');
    expect(scheduleTimeLabel({ startTime: '14:00' })).toBe('14:00 ~');
    expect(scheduleTimeLabel({ endTime: '18:00' })).toBe('待定');
  });
});
