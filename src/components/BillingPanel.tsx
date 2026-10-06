import { useEffect, useMemo, useState } from 'react';
import type { Expense, SaveExpenseInput, Trip } from '../domain/models';
import { calculateSettlement, formatMinorUnits, parseMoneyToMinorUnits } from '../domain/billing';
import { repositories } from '../services/repositories';
import ExpenseFormDialog from './ExpenseFormDialog';

interface Props { trip: Trip; currentUserId?: string; currentUserName?: string; canManage: boolean }

export default function BillingPanel({ trip, currentUserId, currentUserName, canManage }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined);
  const [deletingId, setDeletingId] = useState('');
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const memberIds = useMemo(() => [...new Set([trip.ownerId, ...trip.coWorkerIds])], [trip]);
  const members = useMemo(() => memberIds.map((id) => ({ id, name: memberNames[id]
    ?? (id === currentUserId && currentUserName ? currentUserName : `使用者 ${id.slice(0, 8)}`) })),
  [memberIds, memberNames, currentUserId, currentUserName]);
  const settlement = useMemo(() => calculateSettlement(expenses, memberIds), [expenses, memberIds]);
  const total = expenses.reduce((sum, expense) => sum + (parseMoneyToMinorUnits(expense.totalAmount) ?? 0), 0);

  async function load() {
    setLoading(true); setError('');
    try {
      const [nextExpenses, names] = await Promise.all([
        repositories.expense.getExpensesByTrip(trip.id),
        repositories.expense.getTripMemberDisplayNames(trip.id),
      ]);
      setExpenses(nextExpenses);
      setMemberNames(Object.fromEntries(names.map((member: { userId: string; displayName: string }) => [member.userId, member.displayName])));
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : '讀取共同支出失敗。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [trip.id]);

  async function save(input: SaveExpenseInput) {
    await repositories.expense.saveExpense(input);
    await load();
    setEditing(undefined);
  }
  async function remove(expense: Expense) {
    if (!window.confirm(`確定刪除「${expense.description}」？`)) return;
    setDeletingId(expense.id); setError('');
    try { await repositories.expense.deleteExpense(expense.id); await load(); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : '刪除支出失敗。'); }
    finally { setDeletingId(''); }
  }

  return <section className="billing-panel" aria-labelledby="billing-title">
    <div className="section-heading"><div><p className="eyebrow">SHARED EXPENSES</p><h2 id="billing-title">共同支出</h2></div>{canManage && <button type="button" className="button button-primary" onClick={() => setEditing(null)}>新增支出</button>}</div>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {loading ? <p className="loading-state" role="status">正在載入共同支出…</p> : <>
      <div className="settlement-summary">
        <article><span>總支出</span><strong>{formatMinorUnits(total)}</strong></article>
        {settlement.balances.map((balance) => <article key={balance.userId}><span>{balance.displayName}{balance.leftTrip ? '（已離開旅程）' : ''}</span><small>已付款 {formatMinorUnits(balance.paid)} · 應負擔 {formatMinorUnits(balance.owed)}</small><strong className={balance.balance < 0 ? 'danger-text' : ''}>{balance.balance > 0 ? '應收 ' : balance.balance < 0 ? '應付 ' : '已平衡 '}{formatMinorUnits(Math.abs(balance.balance))}</strong></article>)}
      </div>
      <div className="transfer-box"><h3>建議轉帳</h3>{settlement.transfers.length ? <ul>{settlement.transfers.map((transfer, index) => <li key={`${transfer.fromUserId}-${transfer.toUserId}-${index}`}>{transfer.fromDisplayName} → {transfer.toDisplayName} <strong>{formatMinorUnits(transfer.amount)}</strong></li>)}</ul> : <p>目前沒有轉帳建議。</p>}<small>依目前支出計算的轉帳建議，未記錄實際還款。</small></div>
      {expenses.length === 0 ? <div className="empty-state compact-empty"><p>目前沒有共同支出。</p></div> : <ol className="expense-list">{expenses.map((expense) => <li key={expense.id}><div className="expense-row"><div><h3>{expense.description}</h3><p>{expense.payerDisplayName} 先付款 · {new Date(expense.createdAt).toLocaleString()}</p></div><strong>{expense.totalAmount}</strong>{canManage && <div className="schedule-actions"><button type="button" className="icon-button" onClick={() => setEditing(expense)}>編輯</button><button type="button" className="icon-button danger-text" disabled={deletingId === expense.id} onClick={() => void remove(expense)}>{deletingId === expense.id ? '刪除中…' : '刪除'}</button></div>}</div><details><summary>查看分攤</summary><ul>{expense.splits.map((split) => <li key={split.userId}><span>{split.userDisplayName}</span><strong>{split.amount}</strong></li>)}</ul></details></li>)}</ol>}
    </>}
    {editing !== undefined && <ExpenseFormDialog tripId={trip.id} members={members} currentUserId={currentUserId} expense={editing ?? undefined} onSave={save} onClose={() => setEditing(undefined)} />}
  </section>;
}
