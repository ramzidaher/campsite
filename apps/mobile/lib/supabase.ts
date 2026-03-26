import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

function getExtra(): { url: string; key: string } {
  const extra = Constants.expoConfig?.extra as
    | { supabaseUrl?: string; supabaseAnonKey?: string }
    | undefined;
  return {
    url: extra?.supabaseUrl ?? '',
    key: extra?.supabaseAnonKey ?? '',
  };
}

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getExtra();
  return Boolean(url && key);
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const { url, key } = getExtra();
  if (!url || !key) {
    throw new Error(
      'Missing Supabase env: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for the mobile app.'
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
