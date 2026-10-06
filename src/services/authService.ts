import type { Session, Subscription } from '@supabase/supabase-js';
import { requireSupabase, supabase } from './supabaseClient';

export type AuthSnapshot =
  | { status: 'initializing'; session: null }
  | { status: 'signedOut'; session: null }
  | { status: 'signedIn'; session: Session }
  | { status: 'error'; session: null; error: string };

class AuthService {
  private snapshot: AuthSnapshot = { status: 'initializing', session: null };
  private listeners = new Set<(snapshot: AuthSnapshot) => void>();
  private subscription: Subscription | null = null;
  private initializationTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private lifecycle = 0;
  private revision = 0;

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: AuthSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.subscription?.unsubscribe();
        this.subscription = null;
        if (this.initializationTimer) clearTimeout(this.initializationTimer);
        this.initializationTimer = null;
        this.started = false;
        this.lifecycle += 1;
      }
    };
  }

  async signInWithGoogle() {
    const client = requireSupabase();
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw error;
  }

  async signOut() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  }

  private start() {
    if (this.started) return;
    if (!supabase) {
      this.setSnapshot({
        status: 'error',
        session: null,
        error: '尚未設定 Supabase。請依 README 設定 .env.local。',
      });
      return;
    }
    this.started = true;
    const lifecycle = ++this.lifecycle;
    const revisionBeforeGetSession = this.revision;
    this.initializationTimer = setTimeout(() => {
      if (lifecycle === this.lifecycle && this.snapshot.status === 'initializing') {
        this.setSnapshot({
          status: 'error',
          session: null,
          error: '登入狀態確認逾時。請檢查網路與 Supabase 設定後重試，或先以訪客模式瀏覽。',
        });
      }
    }, 10_000);
    const { data: authData } = supabase.auth.onAuthStateChange((_event, session) => {
      if (lifecycle === this.lifecycle) this.setSession(session);
    });
    this.subscription = authData.subscription;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (lifecycle !== this.lifecycle || revisionBeforeGetSession !== this.revision) return;
      if (error) this.setSnapshot({ status: 'error', session: null, error: error.message });
      else this.setSession(data.session);
    }).catch((error: unknown) => {
      if (lifecycle !== this.lifecycle) return;
      this.setSnapshot({
        status: 'error',
        session: null,
        error: error instanceof Error ? error.message : '無法初始化登入狀態。',
      });
    });
  }

  private setSession(session: Session | null) {
    this.revision += 1;
    this.setSnapshot(session ? { status: 'signedIn', session } : { status: 'signedOut', session: null });
  }

  private setSnapshot(snapshot: AuthSnapshot) {
    if (snapshot.status !== 'initializing' && this.initializationTimer) {
      clearTimeout(this.initializationTimer);
      this.initializationTimer = null;
    }
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const authService = new AuthService();