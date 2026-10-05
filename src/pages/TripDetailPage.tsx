import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../app/authContext';
import type { CreateTripInput, Trip } from '../domain/models';
import { canManageSchedule, canManageTrip } from '../domain/permissions';
import { formatDate, getTripDates } from '../domain/validation';
import { repositories } from '../services/repositories';
import TripFormDialog from '../components/TripFormDialog';

export default function TripDetailPage() {
  const { tripId = '' } = useParams();
  const { snapshot } = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.session.user.id : undefined;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    repositories.trip.getTrip(tripId).then((result) => {
      if (active) {
        setTrip(result);
        setError(result ? '' : '找不到這趟旅程。');
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : '讀取旅程失敗。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [tripId]);

  async function saveTrip(input: CreateTripInput) {
    if (!trip) return;
    const schedules = await repositories.schedule.getSchedulesByTrip(trip.id);
    const outOfRangeDates = [...new Set(schedules
      .filter((schedule) => schedule.date < input.startDate || schedule.date > input.endDate)
      .map((schedule) => schedule.date))].sort();
    if (outOfRangeDates.length) throw new Error(`日期範圍會排除既有行程：${outOfRangeDates.join('、')}。`);
    const updated = await repositories.trip.updateTrip(trip.id, input);
    setTrip(updated);
    setShowEdit(false);
  }

  if (loading) return <main className="page-content"><p className="loading-state" role="status">正在載入旅程…</p></main>;
  if (!trip) return <main className="page-content"><p className="notice notice-error" role="alert">{error || '找不到這趟旅程。'}</p><Link to="/">返回旅程列表</Link></main>;

  const tripDates = getTripDates(trip.startDate, trip.endDate);
  const owner = canManageTrip(userId, trip);
  const scheduleEditor = canManageSchedule(userId, trip);
  return (
    <main className="page-content">
      <Link className="back-link" to="/">← 所有旅程</Link>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <section className="trip-overview">
        <div>
          <p className="eyebrow">TRIP DETAIL</p>
          <h1>{trip.name}</h1>
          <p className="date-range">{formatDate(trip.startDate)} — {formatDate(trip.endDate)}</p>
          <p className="trip-meta">{trip.coWorkerIds.length} 位 Co-Worker</p>
        </div>
        {owner && <button type="button" className="button button-secondary" onClick={() => setShowEdit(true)}>編輯旅程</button>}
      </section>
      <div className="section-heading">
        <div><p className="eyebrow">DAY BY DAY</p><h2>每日行程</h2></div>
        {scheduleEditor && <span className="permission-label">可管理行程</span>}
      </div>
      {tripDates.length === 0 ? <p className="notice notice-error">旅程日期範圍無效。</p> : (
        <ol className="day-list">
          {tripDates.map((date, index) => (
            <li key={date}>
              <Link to={`/trips/${trip.id}/days/${date}`}>
                <span className="day-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{formatDate(date, { year: 'numeric' })}</span>
                <span className="day-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {showEdit && <TripFormDialog trip={trip} onSave={saveTrip} onClose={() => setShowEdit(false)} />}
    </main>
  );
}