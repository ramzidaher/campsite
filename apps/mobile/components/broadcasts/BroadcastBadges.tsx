import { useCampsiteTheme } from '@campsite/ui';
import { StyleSheet, Text, View } from 'react-native';

import type { MobileBroadcastRow } from '@/lib/broadcastEnrichRows';

export function BroadcastBadges({ row }: { row: MobileBroadcastRow }) {
  const { tokens } = useCampsiteTheme();
  if (!row.is_pinned && !row.is_mandatory && !row.is_org_wide) return null;
  return (
    <View style={styles.badgeRow}>
      {row.is_pinned ? (
        <View style={[styles.badge, { borderColor: tokens.border, backgroundColor: tokens.background }]}>
          <Text style={[styles.badgeText, { color: tokens.textSecondary }]}>Pinned</Text>
        </View>
      ) : null}
      {row.is_mandatory ? (
        <View style={[styles.badge, styles.badgeUrgent]}>
          <Text style={[styles.badgeText, { color: '#991b1b' }]}>Mandatory</Text>
        </View>
      ) : null}
      {row.is_org_wide ? (
        <View style={[styles.badge, styles.badgeWide]}>
          <Text style={[styles.badgeText, { color: '#44403c' }]}>Org-wide</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeUrgent: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  badgeWide: { backgroundColor: '#f5f5f4', borderColor: '#e7e5e4' },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
