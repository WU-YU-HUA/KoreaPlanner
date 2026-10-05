import { useState, type FormEvent } from 'react';
import type { Schedule, Trip, UpdateScheduleInput } from '../domain/models';
import { findScheduleConflicts, localToday, validateScheduleFields } from '../domain/validation';
import Modal from './Modal';
import PlacePicker from './PlacePicker';

interface ScheduleFormDialogProps {
  trip: Trip;
  initialDate: string;
  schedule?: Schedule;
  schedules: Schedule[];
  onSave(input: UpdateScheduleInput): Promise<void>;
  onClose(): void;
}

export default function ScheduleFormDialog({ trip, initialDate, schedule, schedules, onSave, onClose }: ScheduleFormDialogProps) {
  const [name, setName] = useState(schedule?.name ?? '');
  const [date, setDate] = useState(schedule?.date ?? initialDate ?? localToday());
  const [startTime, setStartTime] = useState(schedule?.startTime ?? '');
  const [endTime, setEndTime] = useState(schedule?.endTime ?? '');
  const [comment, setComment] = useState(schedule?.comment ?? '');
  const [place, setPlace] = useState(schedule?.place ?? null);
  const [searchMode, setSearchMode] = useState(schedule?.place.provider !== 'manual');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (searchMode && !query.trim() && !place) {
      setError('請輸入地點搜尋文字，或切換至手動定位。');
      return;
    }
    if (!place) {
      setError('請先明確確認一個地點。');
      return;
    }
    const validationError = validateScheduleFields({ name, date, startTime, endTime, place }, trip);
    if (validationError) {
      setError(validationError);
      return;
    }
    const candidate: Schedule = {
      id: schedule?.id ?? 'new-schedule',
      tripId: trip.id,
      name: name.trim(),
      comment: comment.trim() || undefined,
      date,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      place,
      createdAt: schedule?.createdAt ?? new Date().toISOString(),
      updatedAt: schedule?.updatedAt ?? new Date().toISOString(),
    };
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: candidate.name,
        comment: candidate.comment,
        date: candidate.date,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        place: candidate.place,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存行程失敗。');
    } finally {
      setSaving(false);
    }
  }

  const conflicts = place && startTime && endTime
    ? findScheduleConflicts({
      id: schedule?.id ?? 'new-schedule',
      tripId: trip.id,
      name,
      comment: comment || undefined,
      date,
      startTime,
      endTime,
      place,
      createdAt: schedule?.createdAt ?? '',
      updatedAt: schedule?.updatedAt ?? '',
    }, schedules)
    : [];

  return (
    <Modal title={schedule ? '編輯行程' : '新增行程'} onClose={onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <label>行程名稱<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>日期<input type="date" min={trip.startDate} max={trip.endDate} value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <div className="field-grid">
          <label>開始時間（選填）<input type="time" step={60} value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
          <label>結束時間（選填）<input type="time" step={60} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        </div>
        <label>備註（選填）<textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        <PlacePicker
          value={place}
          onConfirm={setPlace}
          onSearchStateChange={(mode, nextQuery) => {
            setSearchMode(mode === 'search');
            setQuery(nextQuery);
          }}
        />
        {conflicts.length > 0 && <p className="conflict-warning" role="status">時段與「{conflicts.map((item) => item.name).join('」、「')}」重疊；仍可儲存。</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="button button-primary" disabled={saving || !place}>
            {saving ? '儲存中…' : '儲存行程'}
          </button>
        </div>
      </form>
    </Modal>
  );
}