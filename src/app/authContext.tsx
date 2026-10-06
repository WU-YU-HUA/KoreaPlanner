import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { authService, type AuthSnapshot } from '../services/authService';

interface AuthContextValue {
  snapshot: AuthSnapshot;
  isGuest: boolean;
  continueAsGuest(): void;
  signOutToGuest(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GUEST_KEY = 'korea-planner:guest';

function subscribeToAuth(notify: () => void) {
  return authService.subscribe(() => notify());
}

function getAuthSnapshot() {
  return authService.getSnapshot();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getAuthSnapshot,
  );
  const [isGuest, setGuest] = useState(() => sessionStorage.getItem(GUEST_KEY) === 'true');

  useEffect(() => {
    if (snapshot.status === 'signedIn') {
      sessionStorage.removeItem(GUEST_KEY);
      setGuest(false);
    }
  }, [snapshot.status]);

  function continueAsGuest() {
    sessionStorage.setItem(GUEST_KEY, 'true');
    setGuest(true);
  }

  async function signOutToGuest() {
    const wasGuest = isGuest;
    continueAsGuest();
    try {
      await authService.signOut();
    } catch (error) {
      if (!wasGuest) {
        sessionStorage.removeItem(GUEST_KEY);
        setGuest(false);
      }
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{ snapshot, isGuest, continueAsGuest, signOutToGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}