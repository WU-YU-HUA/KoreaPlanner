import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../app/authContext';
import type { CreateScheduleInput, Schedule, Trip, UpdateScheduleInput } from '../domain/models';
import { canManageSchedule } from '../domain/permissions';
import { formatDate, isValidDate, sortSchedules } from '../domain/validation';
import { getKakaoMapUrl } from '../services/kakaoLinks';
import { getGoogleMapUrl } from '../services/googleMapLinks';
import { getNaverMapAndroidIntentUrl, getNaverMapAppUrl, getNaverMapUrl } from '../services/naverMapLinks';
import { repositories } from '../services/repositories';
import ScheduleFormDialog from '../components/ScheduleFormDialog';

export default function DailyPlannerPage() {
  const { tripId = '', date = '' } = useParams();
  const { snapshot, isGuest } = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.session.user.id : undefined;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Schedule | undefined>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      repositories.trip.getTrip(tripId),
      repositories.schedule.getSchedulesByTrip(tripId),
    ]).then(([loadedTrip, loadedSchedules]) => {
      if (!active) return;
      setTrip(loadedTrip);
      setSchedules(loadedSchedules);
      if (!loadedTrip) setError('找不到這趟旅程。');
      else if (!isValidDate(date)) setError('網址中的日期格式無效。');
      else if (date < loadedTrip.startDate || date > loadedTrip.endDate) setError('此日期不在旅程範圍內。');
      else setError('');
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : '讀取每日行程失敗。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [tripId, date]);

  const daySchedules = useMemo(
    () => sortSchedules(schedules.filter((schedule) => schedule.date === date)),
    [schedules, date],
  );
  const scheduleEditor = trip ? canManageSchedule(userId, trip) : false;

  function openNaverMap(place: Schedule['place']) {
    const appName = `${window.location.origin}${window.location.pathname}`;
    const appUrl = getNaverMapAppUrl(place, appName);
    const webUrl = getNaverMapUrl(place);
    const userAgent = navigator.userAgent;

    if (/Android/i.test(userAgent)) {
      window.location.href = getNaverMapAndroidIntentUrl(place, appName);
      return;
    }
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      const startedAt = Date.now();
      window.location.href = appUrl;
      window.setTimeout(() => {
        if (Date.now() - startedAt < 2200) window.location.href = webUrl;
      }, 1500);
      return;
    }
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  }

  async function saveSchedule(input: UpdateScheduleInput) {
    if (!trip) return;
    if (editing) {
      const updated = await repositories.schedule.updateSchedule(editing.id, input);
      setSchedules((current) => current.map((item) => item.id === updated.id ? updated : item));
    } else {
      const created = await repositories.schedule.createSchedule({ ...input, tripId: trip.id } satisfies CreateScheduleInput);
      setSchedules((current) => [...current, created]);
    }
    setShowForm(false);
    setEditing(undefined);
  }

  async function deleteSchedule(schedule: Schedule) {
    if (!window.confirm(`確定刪除「${schedule.name}」？`)) return;
    setError('');
    try {
      await repositories.schedule.deleteSchedule(schedule.id);
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '刪除行程失敗。');
    }
  }

  if (loading) return <main className="page-content"><p className="loading-state" role="status">正在載入每日行程…</p></main>;
  if (!trip || error && !isValidDate(date) || error && trip && (date < trip.startDate || date > trip.endDate)) {
    return <main className="page-content"><p className="notice notice-error" role="alert">{error || '找不到這趟旅程。'}</p><Link to={trip ? `/trips/${trip.id}` : '/'}>返回旅程</Link></main>;
  }

  return (
    <main className="page-content">
      <Link className="back-link" to={`/trips/${trip.id}`}>← {trip.name}</Link>
      <div className="page-heading daily-heading">
        <div><p className="eyebrow">DAILY PLANNER</p><h1>{formatDate(date, { year: 'numeric' })}</h1></div>
        {scheduleEditor && <button type="button" className="button button-primary" onClick={() => {
          setEditing(undefined);
          setShowForm(true);
        }}>＋ 新增行程</button>}
      </div>
      {isGuest && <p className="read-only-note">訪客模式：可瀏覽行程，登入並取得旅程權限後才能修改。</p>}
      {!isGuest && !scheduleEditor && <p className="read-only-note">目前登入帳號不是此旅程的 Owner 或 Co-Worker，無法新增或修改行程。</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {daySchedules.length === 0 ? (
        <section className="empty-state compact-empty"><span className="empty-index">NO SCHEDULES</span><h2>這天還沒有行程</h2></section>
      ) : (
        <ol className="schedule-list">
          {daySchedules.map((schedule, index) => (
            <li className="schedule-row" key={schedule.id}>
              <span className="schedule-sequence">{String(index + 1).padStart(2, '0')}</span>
              <div className="schedule-time">{schedule.startTime ?? '時間未設定'}{schedule.endTime ? ` — ${schedule.endTime}` : ''}</div>
              <div className="schedule-copy">
                <h2>{schedule.name}</h2>
                <p className="schedule-place">{schedule.place.name}</p>
                {schedule.comment && <p className="schedule-comment">{schedule.comment}</p>}
                <div className="map-links">
                  <a href={getGoogleMapUrl(schedule.place)} target="_blank" rel="noopener noreferrer" className="map-link">Google ↗</a>
                  <a href={getKakaoMapUrl(schedule.place)} target="_blank" rel="noopener noreferrer" className="map-link">Kakao ↗</a>
                  <a href={getNaverMapUrl(schedule.place)} onClick={(event) => {
                    event.preventDefault();
                    openNaverMap(schedule.place);
                  }} className="map-link">Naver ↗</a>
                </div>
              </div>
              {scheduleEditor && <div className="schedule-actions">
                <button type="button" className="icon-button" aria-label={`編輯 ${schedule.name}`} onClick={() => {
                  setEditing(schedule);
                  setShowForm(true);
                }}>編輯</button>
                <button type="button" className="icon-button danger-text" aria-label={`刪除 ${schedule.name}`} onClick={() => void deleteSchedule(schedule)}>刪除</button>
              </div>}
            </li>
          ))}
        </ol>
      )}
      {showForm && <ScheduleFormDialog
        trip={trip}
        initialDate={date}
        schedule={editing}
        schedules={schedules}
        onSave={saveSchedule}
        onClose={() => { setShowForm(false); setEditing(undefined); }}
      />}
    </main>
  );
}
