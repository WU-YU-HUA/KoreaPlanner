import { useState, type FormEvent } from 'react';
import type { CoWorkerCandidate, CreateTripInput, Trip } from '../domain/models';
import { localToday, validateTripFields } from '../domain/validation';
import { useAuth } from '../app/authContext';
import { userDirectoryService } from '../services/userDirectoryService';
import Modal from './Modal';

interface TripFormDialogProps {
  trip?: Trip;
  onSave(input: CreateTripInput): Promise<void>;
  onClose(): void;
}

export default function TripFormDialog({ trip, onSave, onClose }: TripFormDialogProps) {
  const { snapshot } = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.session.user.id : undefined;
  const [name, setName] = useState(trip?.name ?? '');
  const [startDate, setStartDate] = useState(trip?.startDate ?? localToday());
  const [endDate, setEndDate] = useState(trip?.endDate ?? localToday());
  const [coWorkerIds, setCoWorkerIds] = useState(trip?.coWorkerIds ?? []);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<CoWorkerCandidate | null>(null);
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function lookup() {
    setLookingUp(true);
    setCandidate(null);
    setLookupMessage('');
    try {
      const result = await userDirectoryService.lookupGoogleUser(email, trip?.id);
      if (!result) {
        setLookupMessage('找不到此帳號，請對方先用 Google 登入一次，再重新搜尋。');
      } else if (result.id === userId) {
        setLookupMessage('Owner 不需要加入自己的協作者名單。');
      } else if (coWorkerIds.includes(result.id)) {
        setLookupMessage('此協作者已在名單中。');
      } else {
        setCandidate(result);
      }
    } catch (lookupError) {
      setLookupMessage(lookupError instanceof Error ? lookupError.message : '搜尋帳號失敗，請重試。');
    } finally {
      setLookingUp(false);
    }
  }

  function addCandidate() {
    if (!candidate) return;
    setCoWorkerIds((ids) => [...ids, candidate.id]);
    setLabels((current) => ({ ...current, [candidate.id]: candidate.email }));
    setCandidate(null);
    setEmail('');
    setLookupMessage('已加入待儲存名單。');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateTripFields(name, startDate, endDate);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), startDate, endDate, coWorkerIds });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存旅程失敗。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={trip ? '編輯旅程' : '建立旅程'} onClose={onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <label>旅程名稱<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <div className="field-grid">
          <label>開始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
          <label>結束日期<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
        </div>
        <fieldset className="collaborator-fieldset">
          <legend>Co-Worker</legend>
          <div className="lookup-row">
            <label className="visually-hidden" htmlFor="coworker-email">Google Gmail 地址</label>
            <input id="coworker-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" />
            <button className="button button-secondary" type="button" onClick={() => void lookup()} disabled={lookingUp || !email.trim()}>
              {lookingUp ? '搜尋中…' : '搜尋'}
            </button>
          </div>
          {lookupMessage && <p className="field-message" role="status">{lookupMessage}</p>}
          {candidate && (
            <div className="candidate-row">
              <span>{candidate.email}</span>
              <button type="button" className="button button-secondary" onClick={addCandidate}>加入</button>
            </div>
          )}
          <ul className="collaborator-list">
            {coWorkerIds.map((id) => (
              <li key={id}>
                <span>{labels[id] ?? id}</span>
                <button type="button" className="text-button danger-text" onClick={() => {
                  setCoWorkerIds((ids) => ids.filter((workerId) => workerId !== id));
                }}>移除</button>
              </li>
            ))}
          </ul>
        </fieldset>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? '儲存中…' : '儲存旅程'}
          </button>
        </div>
      </form>
    </Modal>
  );
}