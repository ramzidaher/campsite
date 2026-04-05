import {
  ThemeProvider as NavThemeProvider,
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, ToastProvider, useCampsiteTheme } from '@campsite/ui';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { OfflineBanner } from '@/components/OfflineBanner';
import { useColorScheme as useAppColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuthGate } from '@/lib/AuthContext';
import { CampsiteQueryProvider } from '@/lib/CampsiteQueryProvider';
import { useRegisterPushNotifications } from '@/lib/registerPushNotifications';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

/** Maps React Navigation `colors.primary` (ripples, fallbacks) to Campsite accent. */
function NavThemeBridge({ children }: { children: ReactNode }) {
  const { tokens, scheme } = useCampsiteTheme();
  const navTheme = useMemo((): NavigationTheme => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: tokens.accent,
        background: tokens.background,
        card: scheme === 'dark' ? tokens.surface : '#ffffff',
        text: tokens.textPrimary,
        border: tokens.border,
      },
    };
  }, [scheme, tokens.accent, tokens.background, tokens.surface, tokens.textPrimary, tokens.border]);
  return <NavThemeProvider value={navTheme}>{children}</NavThemeProvider>;
}

function AuthNavigationShell() {
  useAuthGate();
  const colorScheme = useAppColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  useRegisterPushNotifications();

  return (
    <CampsiteQueryProvider>
      <ThemeProvider scheme={scheme} accent="midnight">
        <ToastProvider>
          <View style={{ flex: 1 }}>
            <OfflineBanner />
            <View style={{ flex: 1 }}>
              <NavThemeBridge>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" options={{ headerShown: false, title: 'Campsite' }} />
                  {/* iOS uses this as the back button label when pushing onto the root stack (e.g. compose).
                      Without a title, React Navigation shows the raw group name "(tabs)". */}
                  <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Campsite' }} />
                  <Stack.Screen
                    name="broadcast/[id]"
                    options={{
                      headerShown: false,
                      title: 'Broadcast',
                      animation: 'slide_from_right',
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />
                  <Stack.Screen name="broadcast-compose" options={{ headerShown: true, title: 'Broadcast' }} />
                  <Stack.Screen name="settings" options={{ headerShown: false, title: 'Settings' }} />
                  <Stack.Screen name="pending-approvals" options={{ headerShown: false, title: 'Approvals' }} />
                  {/* Same rationale as (tabs): avoid raw "(auth)" as the iOS back label. */}
                  <Stack.Screen name="(auth)" options={{ headerShown: false, title: 'Campsite' }} />
                  <Stack.Screen name="pending" options={{ headerShown: false, title: 'Pending' }} />
                  <Stack.Screen name="auth/callback" options={{ headerShown: false, title: 'Campsite' }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
                </Stack>
              </NavThemeBridge>
            </View>
          </View>
        </ToastProvider>
      </ThemeProvider>
    </CampsiteQueryProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <AuthNavigationShell />
    </AuthProvider>
  );
}
