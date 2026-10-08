import { describe, expect, it } from 'vitest';
import { sortMyTrips } from './trips';

describe('sortMyTrips', () => {
  it('orders ongoing and upcoming trips by start date, then ended trips by most recent end date', () => {
    const trips = [
      { startDate: '2026-12-01', endDate: '2026-12-07' },
      { startDate: '2026-09-01', endDate: '2026-09-07' },
      { startDate: '2026-10-01', endDate: '2026-10-07' },
      { startDate: '2026-10-09', endDate: '2026-10-12' },
      { startDate: '2026-10-05', endDate: '2026-10-08' },
    ];

    expect(sortMyTrips(trips, '2026-10-08')).toEqual([
      trips[4], trips[3], trips[0], trips[2], trips[1],
    ]);
    expect(trips[0].startDate).toBe('2026-12-01');
  });

  it('preserves the original order for trips with equal dates', () => {
    const trips = [
      { id: 'first', startDate: '2026-10-09', endDate: '2026-10-12' },
      { id: 'second', startDate: '2026-10-09', endDate: '2026-10-12' },
    ];
    expect(sortMyTrips(trips, '2026-10-08')).toEqual(trips);
    expect(sortMyTrips([], '2026-10-08')).toEqual([]);
  });
});
