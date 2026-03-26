import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useRouter, useSegments } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type ProfileRow = {
  id: string;
  org_id: string | null;
  full_name: string | null;
  status: string;
  role: string;
  email: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  loading: boolean;
  configured: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function parseAuthUrl(url: string) {
  try {
    const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
    const qStart = url.indexOf('?');
    const query =
      !hash && qStart >= 0 ? url.slice(qStart + 1).split('#')[0] : '';
    const params = new URLSearchParams(hash || query);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
  } catch {
    /* ignore */
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const profileLoadId = useRef(0);

  const refreshProfile = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      return;
    }
    const id = ++profileLoadId.current;
    const { data } = await supabase
      .from('profiles')
      .select('id, org_id, full_name, status, role, email')
      .eq('id', user.id)
      .maybeSingle();
    if (id === profileLoadId.current) {
      setProfile((data as ProfileRow | null) ?? null);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) {
        setSession(s);
        setLoading(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    void refreshProfile();
  }, [session, session?.user?.id, refreshProfile]);

  useEffect(() => {
    if (!configured) return;
    const handleUrl = async (url: string | null) => {
      if (!url || (!url.includes('access_token') && !url.includes('refresh_token'))) return;
      const tokens = parseAuthUrl(url);
      if (!tokens) return;
      const supabase = getSupabase();
      const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (!error) void refreshProfile();
    };
    void Linking.getInitialURL().then((u) => void handleUrl(u));
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => sub.remove();
  }, [configured, refreshProfile]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setProfile(null);
  }, [configured]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      configured,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, configured, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Expo Router auth redirects — mirrors web home gate (pending / inactive / profile). */
export function useAuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { session, profile, loading, configured } = useAuth();
  const inactiveHandled = useRef(false);

  useEffect(() => {
    if (profile?.status !== 'inactive') inactiveHandled.current = false;
  }, [profile?.status]);

  useEffect(() => {
    if (!session) inactiveHandled.current = false;
  }, [session]);

  useEffect(() => {
    if (!configured || loading) return;

    const s = segments as readonly string[];
    const root = s[0];
    const second = s[1];
    const third = s[2];

    const inAuth = root === '(auth)';
    const onAuthCallback = root === 'auth' && second === 'callback';
    const onPendingScreen = root === 'pending';
    const onRegisterDone = inAuth && second === 'register' && third === 'done';
    const onRegister = inAuth && second === 'register';

    if (!session) {
      if (inAuth || onAuthCallback) return;
      router.replace('/(auth)/login');
      return;
    }

    if (!profile) {
      if (onRegister) return;
      router.replace('/(auth)/register');
      return;
    }

    if (profile.status === 'inactive') {
      if (inactiveHandled.current) return;
      inactiveHandled.current = true;
      void getSupabase()
        .auth.signOut()
        .then(() =>
          router.replace({ pathname: '/(auth)/login', params: { error: 'inactive' } })
        );
      return;
    }

    if (profile.status === 'pending') {
      if (onPendingScreen || onRegisterDone) return;
      router.replace('/pending');
      return;
    }

    if (onPendingScreen || inAuth) {
      router.replace('/(tabs)');
    }
  }, [configured, loading, session, profile, segments, router]);
}
