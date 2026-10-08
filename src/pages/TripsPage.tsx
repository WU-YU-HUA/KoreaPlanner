import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/authContext';
import type { CreateTripInput, Trip } from '../domain/models';
import { canManageTrip } from '../domain/permissions';
import { formatDate, localToday } from '../domain/validation';
import { getFavoriteTrips, sortMyTrips } from '../domain/trips';
import { repositories } from '../services/repositories';
import TripFormDialog from '../components/TripFormDialog';
import TripFavoriteButton from '../components/TripFavoriteButton';
import { useTripFavorites } from '../services/useTripFavorites';

export default function TripsPage() {
  const { snapshot, isGuest } = useAuth();
  const userId = snapshot.status === 'signedIn' ? snapshot.session.user.id : undefined;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | undefined>();
  const [reload, setReload] = useState(0);
  const [allSearch, setAllSearch] = useState('');
  const [mySearch, setMySearch] = useState('');
  const [favoriteSearch, setFavoriteSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'favorites'>('all');
  const favorites = useTripFavorites(userId);

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

  const today = localToday();
  const myTrips = useMemo(
    () => userId ? sortMyTrips(
      trips.filter((trip) => trip.ownerId === userId || trip.coWorkerIds.includes(userId)), today,
    ) : [],
    [trips, userId, today],
  );

  function searchTrips(source: Trip[], query: string) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return source;
    return source.filter((trip) => [
      trip.name,
      trip.startDate,
      trip.endDate,
      formatDate(trip.startDate),
      formatDate(trip.endDate),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }

  const allSearchResults = useMemo(() => searchTrips(trips, allSearch), [trips, allSearch]);
  const mySearchResults = useMemo(() => searchTrips(myTrips, mySearch), [myTrips, mySearch]);

  const favoriteTrips = useMemo(() => getFavoriteTrips(trips, favorites.ids), [trips, favorites.ids]);
  const favoriteSearchResults = useMemo(() => searchTrips(favoriteTrips, favoriteSearch), [favoriteTrips, favoriteSearch]);

  function renderTripRows(results: Trip[]) {
    return results.map((trip) => (
      <article className="trip-row" key={trip.id}>
        <Link className="trip-main-link" to={`/trips/${trip.id}`}>
          <span className="trip-date-label">{formatDate(trip.startDate)} — {formatDate(trip.endDate)}</span>
          <h2>{trip.name}</h2>
          <span className="trip-meta">可編輯行程：{trip.coWorkerIds.length + 1} 人</span>
        </Link>
        {userId && (
          <div className="trip-actions">
            <TripFavoriteButton tripId={trip.id} tripName={trip.name} favorites={favorites} />
            {canManageTrip(userId, trip) && <>
              <button type="button" className="icon-button" aria-label={`編輯 ${trip.name}`} onClick={() => openEdit(trip)}>編輯</button>
              <button type="button" className="icon-button danger-text" aria-label={`刪除 ${trip.name}`} onClick={() => void deleteTrip(trip)}>刪除</button>
            </>}
          </div>
        )}
      </article>
    ));
  }

  function renderEmptyResult(query: string, emptyMessage: string) {
    return <p className="filtered-empty">{query.trim() ? `沒有符合「${query.trim()}」的旅程。` : emptyMessage}</p>;
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const tabs = ['all', 'mine', 'favorites'] as const;
    const index = tabs.indexOf(activeTab);
    const nextTab = event.key === 'Home' ? tabs[0]
      : event.key === 'End' ? tabs[2]
        : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setActiveTab(nextTab);
    document.getElementById(`${nextTab}-trips-tab`)?.focus();
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
      {favorites.error && <p className="notice notice-error" role="alert">{favorites.error} <button type="button" className="icon-button" onClick={favorites.retry}>重新載入收藏</button></p>}
      <div className="trip-tabs" role="tablist" aria-label="旅程分類" onKeyDown={handleTabKeyDown}>
        <button
          id="all-trips-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          aria-controls="trip-list-panel"
          tabIndex={activeTab === 'all' ? 0 : -1}
          onClick={() => setActiveTab('all')}
        >所有旅程 <span className="tab-count">{trips.length}</span></button>
        <button
          id="mine-trips-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'mine'}
          aria-controls="trip-list-panel"
          tabIndex={activeTab === 'mine' ? 0 : -1}
          onClick={() => setActiveTab('mine')}
        >我的旅程 <span className="tab-count">{myTrips.length}</span></button>
        <button
          id="favorites-trips-tab" type="button" role="tab"
          aria-selected={activeTab === 'favorites'} aria-controls="trip-list-panel"
          tabIndex={activeTab === 'favorites' ? 0 : -1} onClick={() => setActiveTab('favorites')}
        >收藏旅程 <span className="tab-count">{favoriteTrips.length}</span></button>
      </div>
      <section id="trip-list-panel" className="trip-tabpanel" role="tabpanel"
        aria-labelledby={`${activeTab}-trips-tab`} tabIndex={0}>
        {activeTab === 'all' ? (
          <>
            <label className="trip-search">
              <span aria-hidden="true">⌕</span>
              <span className="visually-hidden">搜尋所有旅程</span>
              <input type="search" value={allSearch} onChange={(event) => setAllSearch(event.target.value)} placeholder="搜尋旅程名稱或日期" />
            </label>
            {loading ? <p className="loading-state" role="status">正在載入旅程…</p>
              : allSearchResults.length ? <div className="trip-list" aria-label="所有旅程列表">{renderTripRows(allSearchResults)}</div>
                : renderEmptyResult(allSearch, trips.length ? '目前沒有旅程。' : '目前沒有可瀏覽的旅程。')}
          </>
        ) : activeTab === 'mine' ? (
          <>
            <label className="trip-search">
              <span aria-hidden="true">⌕</span>
              <span className="visually-hidden">搜尋我的旅程</span>
              <input type="search" value={mySearch} onChange={(event) => setMySearch(event.target.value)} placeholder="搜尋旅程名稱或日期" />
            </label>
            {loading ? <p className="loading-state" role="status">正在載入旅程…</p>
              : mySearchResults.length ? <div className="trip-list" aria-label="我的旅程列表">{renderTripRows(mySearchResults)}</div>
                : renderEmptyResult(mySearch, userId ? '你尚未建立或加入旅程。' : '登入後可查看你擁有或協作的旅程。')}
          </>
        ) : (
          <>
            <label className="trip-search">
              <span aria-hidden="true">⌕</span>
              <span className="visually-hidden">搜尋收藏旅程</span>
              <input type="search" value={favoriteSearch} onChange={(event) => setFavoriteSearch(event.target.value)} placeholder="搜尋旅程名稱或日期" />
            </label>
            {loading || favorites.loading ? <p className="loading-state" role="status">正在載入收藏旅程…</p>
              : userId && !favorites.ready ? <p className="filtered-empty">無法讀取收藏，請重新載入收藏。</p>
                : favoriteSearchResults.length ? <div className="trip-list" aria-label="收藏旅程列表">{renderTripRows(favoriteSearchResults)}</div>
                  : renderEmptyResult(favoriteSearch, userId ? '尚未收藏旅程，點選旅程旁的星號即可收藏。' : '登入後可收藏旅程。')}
          </>
        )}
      </section>
      {showForm && <TripFormDialog trip={editingTrip} onSave={saveTrip} onClose={() => {
        setShowForm(false);
        setEditingTrip(undefined);
      }} />}
    </main>
  );
}
