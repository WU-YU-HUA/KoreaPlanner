import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { AuthSnapshot } from '../services/authService';
import { authService } from '../services/authService';
import { getMissingConfiguration, supabase } from '../services/supabaseClient';

function useAuthSnapshot() {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(() => authService.getSnapshot());
  useEffect(() => authService.subscribe(setSnapshot), []);
  return snapshot;
}

function getOAuthCallbackError() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error_description') ?? params.get('error');
  return error?.replaceAll('+', ' ') ?? '';
}

function LoginPage() {
  const snapshot = useAuthSnapshot();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [callbackError] = useState(getOAuthCallbackError);
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

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">KP</div>
        <p className="eyebrow">KOREA · TRAVEL PLANNER</p>
        <h1 id="login-title">把旅程，<br />從這裡開始。</h1>
        <p className="auth-description">使用 Google 帳號登入 Korea Planner。</p>
        {callbackError && <p className="notice notice-error" role="alert">Google 登入未完成：{callbackError}</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {missing.length > 0 && (
          <div className="notice notice-error" role="alert">
            尚未設定：{missing.join('、')}。請在專案根目錄建立 `.env.local` 並填入 Supabase 專案設定，重新啟動 Vite。
          </div>
        )}
        {snapshot.status === 'error' && missing.length === 0 && (
          <p className="notice notice-error" role="alert">無法還原登入狀態：{snapshot.error}</p>
        )}
        <button
          className="google-button"
          type="button"
          onClick={signIn}
          disabled={busy || !supabase}
        >
          <span className="google-g" aria-hidden="true">G</span>
          {busy ? '正在前往 Google…' : '使用 Google 登入'}
        </button>
        <p className="auth-footnote">登入後，你可以與旅伴共同管理行程。</p>
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

function SignedInHome() {
  const snapshot = useAuthSnapshot();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (snapshot.status === 'signedOut') navigate('/login', { replace: true });
  }, [navigate, snapshot.status]);

  if (snapshot.status === 'initializing') {
    return <main className="auth-page"><p className="loading-state" role="status">正在確認登入狀態…</p></main>;
  }
  if (snapshot.status !== 'signedIn') return <Navigate to="/login" replace />;

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await authService.signOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : '登出失敗，請重試。');
      setBusy(false);
    }
  }

  return (
    <main className="auth-page signed-in-page">
      <section className="auth-panel signed-in-panel" aria-labelledby="signed-in-title">
        <div className="brand-mark" aria-hidden="true">KP</div>
        <p className="eyebrow">KOREA · TRAVEL PLANNER</p>
        <h1 id="signed-in-title">登入成功</h1>
        <div className="account-row">
          <span className="account-dot" aria-hidden="true" />
          <div>
            <span className="field-caption">目前登入帳號</span>
            <strong>{snapshot.session.user.email ?? 'Google 帳號'}</strong>
          </div>
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="button button-secondary signout-button" type="button" onClick={signOut} disabled={busy}>
          {busy ? '正在登出…' : '登出'}
        </button>
        <p className="auth-footnote">Session 會在重新整理後保留。</p>
      </section>
      <aside className="auth-aside" aria-label="Korea Planner">
        <span className="aside-index">SESSION / ACTIVE</span>
        <div className="route-line" aria-hidden="true"><i /><i /><i /></div>
        <p>旅程準備就緒。</p>
        <span>YOUR DAYS, WELL PLANNED</span>
      </aside>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<SignedInHome />} />
      <Route path="/trips/:tripId" element={<Navigate to="/" replace />} />
      <Route path="/trips/:tripId/days/:date" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}