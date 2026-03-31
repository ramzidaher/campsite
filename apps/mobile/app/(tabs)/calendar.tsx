import { useQuery } from '@tanstack/react-query';

import { CalendarScreen } from '@/components/calendar/CalendarScreen';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { useAuth } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useCampsiteTheme } from '@campsite/ui';
import { Text, View } from 'react-native';

export default function CalendarRoute() {
  const { profile } = useAuth();
  const { tokens } = useCampsiteTheme();

  const orgTzQuery = useQuery({
    queryKey: ['mobile-org-timezone-calendar', profile?.org_id],
    enabled: Boolean(profile?.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organisations')
        .select('timezone')
        .eq('id', profile!.org_id!)
        .maybeSingle();
      if (error) throw error;
      return (data?.timezone as string | null) ?? null;
    },
  });

  if (!profile?.org_id) {
    return (
      <TabSafeScreen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: tokens.textSecondary }}>Sign in to view your calendar.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  return (
    <CalendarScreen
      profile={{
        ...profile,
        org_timezone: orgTzQuery.data ?? null,
      }}
    />
  );
}
