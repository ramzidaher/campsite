import { ActivityIndicator, View } from 'react-native';

import { HrHubScreen } from '@/components/hr/HrHubScreen';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';

export default function HrRoute() {
  const { profile, profileLoading } = useAuth();

  if (profileLoading && !profile) {
    return (
      <TabSafeScreen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      </TabSafeScreen>
    );
  }

  if (!profile) {
    return (
      <TabSafeScreen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      </TabSafeScreen>
    );
  }

  return <HrHubScreen profile={profile} />;
}
