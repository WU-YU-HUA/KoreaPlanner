import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/authContext';

export default function AppLayout() {
  const { snapshot, isGuest, signOutToGuest } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setSigningOut(true);
    setError('');
    try {
      await signOutToGuest();
      navigate('/', { replace: true });
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : '登出失敗，請重試。');
    } finally {
      setSigningOut(false);
    }
  }

  const email = snapshot.status === 'signedIn' ? snapshot.session.user.email : undefined;
  return (
    <div className="planner-shell">
      <header className="topbar">
        <Link className="wordmark" to="/" aria-label="Korea Planner 首頁">
          <span className="wordmark-symbol">KP</span>
          <span>Korea Planner</span>
        </Link>
        <nav aria-label="主要導覽"><Link to="/">旅程</Link></nav>
        <div className="topbar-account">
          {isGuest ? <span className="guest-label">訪客唯讀</span> : <span className="account-email">{email}</span>}
          {isGuest ? <Link className="text-button" to="/login">登入</Link> : <button type="button" className="text-button" onClick={signOut} disabled={signingOut}>
            {signingOut ? '登出中…' : '登出'}
          </button>}
        </div>
      </header>
      {error && <p className="global-error" role="alert">{error}</p>}
      <Outlet />
    </div>
  );
}