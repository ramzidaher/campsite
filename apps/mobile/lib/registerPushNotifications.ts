import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useRegisterPushNotifications() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    void (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') return;
      await Notifications.requestPermissionsAsync();
    })();
  }, []);
}
