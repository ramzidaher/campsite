import { ActivityIndicator, View } from 'react-native';

import { DiscountCardScreen } from '@/components/discount/DiscountCardScreen';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';

export default function DiscountScreen() {
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ActivityIndicator />
        </View>
      </TabSafeScreen>
    );
  }
  return <DiscountCardScreen profile={profile} />;
}
