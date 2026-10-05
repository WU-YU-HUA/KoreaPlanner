import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/authContext';
import type { CreateTripInput, Trip } from '../domain/models';
import { canManageTrip } from '../domain/permissions';
import { formatDate } from '../domain/validation';
import { repositories } from '../services/repositories';
import TripFormDialog from '../components/TripFormDialog';

export default function TripsPage() {
  const { snapshot, isGuest } = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.session.user.id : undefined;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | undefined>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    repositories.trip.getTrips().then((results) => {
      if (active) {
        setTrips(results);
        setError('');
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : '讀取旅程失敗。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reload]);

  async function saveTrip(input: CreateTripInput) {
    if (editingTrip) {
      const schedules = await repositories.schedule.getSchedulesByTrip(editingTrip.id);
      const outOfRangeDates = [...new Set(schedules
        .filter((schedule) => schedule.date < input.startDate || schedule.date > input.endDate)
        .map((schedule) => schedule.date))].sort();
      if (outOfRangeDates.length) {
        throw new Error(`日期範圍會排除既有行程：${outOfRangeDates.join('、')}。請先調整這些行程日期。`);
      }
      await repositories.trip.updateTrip(editingTrip.id, input);
    } else {
      await repositories.trip.createTrip(input);
    }
    setShowForm(false);
    setEditingTrip(undefined);
    setReload((value) => value + 1);
  }

  async function deleteTrip(trip: Trip) {
    if (!window.confirm(`確定刪除「${trip.name}」？此旅程底下的所有行程也會一併刪除。`)) return;
    setError('');
    try {
      await repositories.trip.deleteTrip(trip.id);
      setTrips((current) => current.filter((item) => item.id !== trip.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '刪除旅程失敗。');
    }
  }

  function openEdit(trip: Trip) {
    setEditingTrip(trip);
    setShowForm(true);
  }

  return (
    <main className="page-content">
      <div className="page-heading">
        <div><p className="eyebrow">YOUR JOURNEYS</p><h1>旅程</h1></div>
        {userId && <button type="button" className="button button-primary" onClick={() => {
          setEditingTrip(undefined);
          setShowForm(true);
        }}>＋ 建立旅程</button>}
      </div>
      {isGuest && <p className="read-only-note">訪客模式：可瀏覽旅程，登入後才能建立或修改。</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <p className="loading-state" role="status">正在載入旅程…</p> : trips.length === 0 ? (
        <section className="empty-state">
          <span className="empty-index">NO TRIPS YET</span>
          <h2>還沒有旅程</h2>
          <p>{userId ? '建立第一趟旅程，開始安排每天的行程。' : '目前沒有可瀏覽的旅程。'}</p>
        </section>
      ) : (
        <div className="trip-list" aria-label="旅程列表">
          {trips.map((trip) => (
            <article className="trip-row" key={trip.id}>
              <Link className="trip-main-link" to={`/trips/${trip.id}`}>
                <span className="trip-date-label">{formatDate(trip.startDate)} — {formatDate(trip.endDate)}</span>
                <h2>{trip.name}</h2>
                <span className="trip-meta">{trip.coWorkerIds.length ? `${trip.coWorkerIds.length} 位 Co-Worker` : '尚無 Co-Worker'}</span>
              </Link>
              {canManageTrip(userId, trip) && (
                <div className="trip-actions">
                  <button type="button" className="icon-button" aria-label={`編輯 ${trip.name}`} onClick={() => openEdit(trip)}>編輯</button>
                  <button type="button" className="icon-button danger-text" aria-label={`刪除 ${trip.name}`} onClick={() => void deleteTrip(trip)}>刪除</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {showForm && <TripFormDialog trip={editingTrip} onSave={saveTrip} onClose={() => {
        setShowForm(false);
        setEditingTrip(undefined);
      }} />}
    </main>
  );
}