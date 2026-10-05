import type { Expense } from './models';

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function parseMoneyToMinorUnits(value: string): number | null {
  if (!MONEY_PATTERN.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

export function formatMinorUnits(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('金額超出可安全計算範圍。');
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function splitEvenly(totalMinorUnits: number, userIds: string[]) {
  if (!Number.isSafeInteger(totalMinorUnits) || totalMinorUnits < 0 || userIds.length === 0) {
    throw new Error('平均分配需要合法總額與至少一位分攤者。');
  }
  const sorted = [...userIds].sort((a, b) => a.localeCompare(b));
  const quotient = Math.floor(totalMinorUnits / sorted.length);
  let remainder = totalMinorUnits % sorted.length;
  return new Map(sorted.map((userId) => {
    const amount = quotient + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    return [userId, amount];
  }));
}

export interface Balance {
  userId: string; displayName: string; paid: number; owed: number; balance: number; leftTrip: boolean;
}

export interface TransferSuggestion {
  fromUserId: string; fromDisplayName: string; toUserId: string; toDisplayName: string; amount: number;
}

export function calculateSettlement(expenses: Expense[], currentMemberIds: string[]) {
  const currentMembers = new Set(currentMemberIds);
  const balances = new Map<string, Balance>();
  const getBalance = (userId: string, displayName: string) => {
    const existing = balances.get(userId);
    if (existing) return existing;
    const created = { userId, displayName, paid: 0, owed: 0, balance: 0, leftTrip: !currentMembers.has(userId) };
    balances.set(userId, created);
    return created;
  };

  for (const expense of expenses) {
    getBalance(expense.paidBy, expense.payerDisplayName).paid += requireMinorUnits(expense.totalAmount);
    for (const split of expense.splits) {
      getBalance(split.userId, split.userDisplayName).owed += requireMinorUnits(split.amount);
    }
  }
  for (const balance of balances.values()) balance.balance = balance.paid - balance.owed;

  const order = (a: Balance, b: Balance) => Math.abs(b.balance) - Math.abs(a.balance)
    || a.userId.localeCompare(b.userId);
  const debtors = [...balances.values()].filter((item) => item.balance < 0).sort(order)
    .map((item) => ({ ...item, remaining: -item.balance }));
  const creditors = [...balances.values()].filter((item) => item.balance > 0).sort(order)
    .map((item) => ({ ...item, remaining: item.balance }));
  const transfers: TransferSuggestion[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.remaining, creditor.remaining);
    if (amount > 0 && debtor.userId !== creditor.userId) {
      transfers.push({ fromUserId: debtor.userId, fromDisplayName: debtor.displayName,
        toUserId: creditor.userId, toDisplayName: creditor.displayName, amount });
    }
    debtor.remaining -= amount;
    creditor.remaining -= amount;
    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }
  return { balances: [...balances.values()].sort((a, b) => a.userId.localeCompare(b.userId)), transfers };
}

function requireMinorUnits(value: string) {
  const parsed = parseMoneyToMinorUnits(value);
  if (parsed === null) throw new Error(`無效金額：${value}`);
  return parsed;
}
