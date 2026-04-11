import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OneOnOneDetailScreen } from '@/components/one-on-one/OneOnOneDetailScreen';
import { useAuth } from '@/lib/AuthContext';

export default function OneOnOneMeetingRoute() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const { profile, profileLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!profileLoading && !profile) router.replace('/(auth)/login');
  }, [profile, profileLoading, router]);

  if (profileLoading && !profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!profile || !meetingId) return null;

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <OneOnOneDetailScreen profile={profile} meetingId={meetingId} />
    </View>
  );
}
