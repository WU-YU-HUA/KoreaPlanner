import { useState } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './authContext';
import AppLayout from '../components/AppLayout';
import DailyPlannerPage from '../pages/DailyPlannerPage';
import TripDetailPage from '../pages/TripDetailPage';
import TripsPage from '../pages/TripsPage';
import { authService } from '../services/authService';
import { getMissingConfiguration, supabase } from '../services/supabaseClient';

function LoginPage() {
  const { snapshot, continueAsGuest } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [callbackError] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('error_description') ?? params.get('error'))?.replaceAll('+', ' ') ?? '';
  });
  const missing = getMissingConfiguration();

  if (snapshot.status === 'signedIn') return <Navigate to="/" replace />;

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      await authService.signInWithGoogle();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Google 登入失敗，請重試。');
      setBusy(false);
    }
  }

  function browseAsGuest() {
    continueAsGuest();
    navigate('/', { replace: true });
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">KP</div>
        <p className="eyebrow">KOREA · TRAVEL PLANNER</p>
        <h1 id="login-title">把旅程，<br />從這裡開始。</h1>
        <p className="auth-description">使用 Google 帳號登入 Korea Planner。</p>
        {callbackError && <p className="notice notice-error" role="alert">Google 登入未完成：{callbackError}</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {missing.length > 0 && <div className="notice notice-error" role="alert">
          尚未設定：{missing.join('、')}。請在專案根目錄建立 `.env.local` 並填入 Supabase 專案設定，重新啟動 Vite。
        </div>}
        {snapshot.status === 'error' && missing.length === 0 && <p className="notice notice-error" role="alert">
          無法還原登入狀態：{snapshot.error}
        </p>}
        <button className="google-button" type="button" onClick={signIn} disabled={busy || !supabase || snapshot.status === 'initializing'}>
          <span className="google-g" aria-hidden="true">G</span>
          {busy ? '正在前往 Google…' : '使用 Google 登入'}
        </button>
        <div className="guest-entry">
          <span>或</span>
          <button type="button" className="text-button" onClick={browseAsGuest}>先瀏覽旅程</button>
        </div>
        <p className="auth-footnote">訪客可以瀏覽所有旅程；建立或修改需要登入與相應權限。</p>
      </section>
      <aside className="auth-aside" aria-label="Korea Planner">
        <span className="aside-index">01 / SEOUL</span>
        <div className="route-line" aria-hidden="true"><i /><i /><i /></div>
        <p>下一站，韓國。</p>
        <span>YOUR DAYS, WELL PLANNED</span>
      </aside>
    </main>
  );
}

function SessionGate() {
  const { snapshot, isGuest } = useAuth();
  if (snapshot.status === 'initializing') return <main className="auth-page"><p className="loading-state" role="status">正在確認登入狀態…</p></main>;
  if (snapshot.status !== 'signedIn' && !isGuest) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SessionGate />}>
        <Route element={<AppLayout />}>
          <Route index element={<TripsPage />} />
          <Route path="trips/:tripId" element={<TripDetailPage />} />
          <Route path="trips/:tripId/days/:date" element={<DailyPlannerPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}