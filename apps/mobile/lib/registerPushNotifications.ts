import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Remote push on Android was removed from Expo Go in SDK 53; loading the module throws. */
const skipExpoNotifications =
  Platform.OS === 'web' ||
  (Platform.OS === 'android' && Constants.appOwnership === 'expo');

export function useRegisterPushNotifications() {
  useEffect(() => {
    if (skipExpoNotifications) return;

    let cancelled = false;

    void (async () => {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      const existing = (await Notifications.getPermissionsAsync()) as {
        status?: string;
        granted?: boolean;
      };
      if (cancelled) return;
      if (existing.granted === true || existing.status === 'granted') return;
      await Notifications.requestPermissionsAsync();
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
