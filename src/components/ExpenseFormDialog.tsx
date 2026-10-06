import { useMemo, useState, type FormEvent } from 'react';
import type { Expense, SaveExpenseInput } from '../domain/models';
import { formatMinorUnits, parseMoneyToMinorUnits, splitEvenly } from '../domain/billing';
import Modal from './Modal';

interface Member { id: string; name: string }
interface Props {
  tripId: string;
  members: Member[];
  currentUserId?: string;
  expense?: Expense;
  onSave(input: SaveExpenseInput): Promise<void>;
  onClose(): void;
}

export default function ExpenseFormDialog({ tripId, members, currentUserId, expense, onSave, onClose }: Props) {
  const formMembers = useMemo(() => expense
    ? expense.splits.map((split) => ({ id: split.userId, name: split.userDisplayName }))
    : members, [expense, members]);
  const payerOptions = useMemo(() => {
    const options = new Map(members.map((member) => [member.id, member.name]));
    if (expense && !options.has(expense.paidBy)) options.set(expense.paidBy, expense.payerDisplayName);
    return [...options].map(([id, name]) => ({ id, name }));
  }, [expense, members]);
  const [description, setDescription] = useState(expense?.description ?? '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy
    ?? (currentUserId && members.some((member) => member.id === currentUserId) ? currentUserId : members[0]?.id ?? ''));
  const [total, setTotal] = useState(expense?.totalAmount ?? '');
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>(() => Object.fromEntries(
    formMembers.map((member) => [member.id, expense?.splits.find((split) => split.userId === member.id)?.amount ?? '0']),
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const totalMinor = parseMoneyToMinorUnits(total);
  const splitMinor = formMembers.map((member) => parseMoneyToMinorUnits(splitAmounts[member.id] ?? ''));
  const splitSum = splitMinor.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const validSplits = splitMinor.every((value) => value !== null);
  const difference = totalMinor === null ? null : totalMinor - splitSum;
  const canSave = description.trim().length > 0 && description.trim().length <= 200 && paidBy
    && totalMinor !== null && totalMinor > 0 && validSplits && difference === 0 && !saving;

  function average() {
    if (totalMinor === null || totalMinor <= 0) {
      setError('請先輸入大於 0、最多兩位小數的總額。');
      return;
    }
    const allocated = splitEvenly(totalMinor, formMembers.map((member) => member.id));
    setSplitAmounts(Object.fromEntries([...allocated].map(([id, amount]) => [id, formatMinorUnits(amount)])));
    setError('');
  }

  function changeSplit(userId: string, value: string) {
    const next = { ...splitAmounts, [userId]: value };
    setSplitAmounts(next);
    const values = formMembers.map((member) => parseMoneyToMinorUnits(next[member.id] ?? ''));
    if (values.every((amount) => amount !== null)) setTotal(formatMinorUnits(values.reduce<number>((sum, amount) => sum + (amount ?? 0), 0)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) { setError('請確認項目、付款人、總額與分攤金額皆有效且加總一致。'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ tripId, expenseId: expense?.id, description: description.trim(), paidBy,
        totalAmount: formatMinorUnits(totalMinor!), splits: formMembers.map((member) => ({
          userId: member.id, amount: formatMinorUnits(parseMoneyToMinorUnits(splitAmounts[member.id])!),
        })) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存支出失敗。');
    } finally { setSaving(false); }
  }

  return <Modal title={expense ? '編輯支出' : '新增支出'} onClose={onClose} wide>
    <form className="form-stack" onSubmit={submit}>
      <label>支出項目<input autoFocus maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
      <label>實際付款人<select value={paidBy} onChange={(event) => setPaidBy(event.target.value)} required>
        {payerOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select></label>
      <div className="expense-total-row">
        <label>總共應付<input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="0.00" /></label>
        <button type="button" className="button button-secondary" onClick={average}>平均</button>
      </div>
      <fieldset className="expense-splits"><legend>每人應付</legend>
        {formMembers.map((member) => <label key={member.id}><span>{member.name}</span><input aria-label={`${member.name} 應付`} inputMode="decimal" value={splitAmounts[member.id] ?? ''} onChange={(event) => changeSplit(member.id, event.target.value)} /></label>)}
      </fieldset>
      {difference !== 0 && <p className="conflict-warning" role="status">尚未分配完成；差額 {difference === null ? '—' : formatMinorUnits(difference)}。</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>取消</button><button type="submit" className="button button-primary" disabled={!canSave}>{saving ? '儲存中…' : '儲存支出'}</button></div>
    </form>
  </Modal>;
}
