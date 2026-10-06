import { describe, expect, it } from 'vitest';
import type { Expense } from './models';
import { calculateSettlement, formatMinorUnits, parseMoneyToMinorUnits, splitEvenly } from './billing';

describe('billing money helpers', () => {
  it('parses only non-negative decimal values with at most two places', () => {
    expect(parseMoneyToMinorUnits('100')).toBe(10000);
    expect(parseMoneyToMinorUnits('0.01')).toBe(1);
    for (const invalid of ['', '-1', '1.001', '1e2', 'Infinity']) expect(parseMoneyToMinorUnits(invalid)).toBeNull();
    expect(formatMinorUnits(10001)).toBe('100.01');
  });

  it('distributes remainder by ascending user ID', () => {
    expect([...splitEvenly(10000, ['c', 'a', 'b'])]).toEqual([
      ['a', 3334], ['b', 3333], ['c', 3333],
    ]);
  });
});

describe('calculateSettlement', () => {
  it('matches balances deterministically and keeps former members', () => {
    const expense = (id: string, paidBy: string, totalAmount: string, splitAmount: string): Expense => ({
      id, tripId: 'trip', description: id, paidBy, payerDisplayName: paidBy,
      totalAmount, createdBy: paidBy, createdAt: id, updatedAt: id,
      splits: ['owner', 'a', 'b'].map((userId) => ({ userId, userDisplayName: userId, amount: splitAmount })),
    });
    const result = calculateSettlement([
      expense('1', 'owner', '900.00', '300.00'),
      expense('2', 'a', '300.00', '100.00'),
    ], ['owner', 'a']);
    expect(result.balances.map(({ userId, balance, leftTrip }) => ({ userId, balance, leftTrip }))).toEqual([
      { userId: 'a', balance: -10000, leftTrip: false },
      { userId: 'b', balance: -40000, leftTrip: true },
      { userId: 'owner', balance: 50000, leftTrip: false },
    ]);
    expect(result.transfers.map(({ fromUserId, toUserId, amount }) => ({ fromUserId, toUserId, amount }))).toEqual([
      { fromUserId: 'b', toUserId: 'owner', amount: 40000 },
      { fromUserId: 'a', toUserId: 'owner', amount: 10000 },
    ]);
  });
});
