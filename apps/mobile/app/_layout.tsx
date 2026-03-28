import { ThemeProvider as NavThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, ToastProvider } from '@campsite/ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { OfflineBanner } from '@/components/OfflineBanner';
import { useColorScheme as useAppColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuthGate } from '@/lib/AuthContext';
import { CampsiteQueryProvider } from '@/lib/CampsiteQueryProvider';
import { useRegisterPushNotifications } from '@/lib/registerPushNotifications';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function AuthNavigationShell() {
  useAuthGate();
  const colorScheme = useAppColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  useRegisterPushNotifications();

  return (
    <CampsiteQueryProvider>
      <ThemeProvider scheme={scheme} accent="ocean">
        <ToastProvider>
          <View style={{ flex: 1 }}>
            <OfflineBanner />
            <View style={{ flex: 1 }}>
              <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="pending-approvals" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="pending" />
                  <Stack.Screen name="auth/callback" />
                  <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
                </Stack>
              </NavThemeProvider>
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
