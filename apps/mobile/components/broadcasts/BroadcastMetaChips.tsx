import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { MobileBroadcastRow } from '@/lib/broadcastEnrichRows';

/** Mirrors web `deptTagClass` (BroadcastFeed). */
export function deptChipPalette(deptName: string): { bg: string; border: string; text: string } {
  const n = deptName || '';
  if (n.includes('Events')) return { bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
  if (n.includes('Human') || n.includes('HR')) return { bg: '#e7e5e4', border: '#d6d3d1', text: '#44403c' };
  if (n.includes('Marketing')) return { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' };
  if (n.includes('Welfare')) return { bg: '#f3e8ff', border: '#e9d5ff', text: '#7c3aed' };
  return { bg: '#f5f4f1', border: '#d8d8d8', text: '#6b6b6b' };
}

function Chip({
  label,
  backgroundColor,
  borderColor,
  textColor,
}: {
  label: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor, borderColor }]}>
      <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Web-aligned pills: pinned, mandatory, org-wide, department, channel, team. */
export function BroadcastMetaChips({ row, style }: { row: MobileBroadcastRow; style?: StyleProp<ViewStyle> }) {
  const deptName = row.dept_name?.trim() || 'General';
  const deptPal = deptChipPalette(deptName);
  const channelLabel = row.is_org_wide ? 'All channels' : row.channel_name?.trim() ?? '';

  return (
    <View style={[styles.row, style]}>
      {row.is_pinned ? (
        <Chip label="Pinned" backgroundColor="#fffbeb" borderColor="#fde68a" textColor="#92400e" />
      ) : null}
      {row.is_mandatory ? (
        <Chip label="Mandatory" backgroundColor="#fef2f2" borderColor="#fecaca" textColor="#991b1b" />
      ) : null}
      {row.is_org_wide ? (
        <Chip label="Org-wide" backgroundColor="#f5f5f4" borderColor="#e7e5e4" textColor="#44403c" />
      ) : null}
      <Chip label={deptName} backgroundColor={deptPal.bg} borderColor={deptPal.border} textColor={deptPal.text} />
      {channelLabel ? (
        <Chip label={channelLabel} backgroundColor="#f5f4f1" borderColor="#d8d8d8" textColor="#6b6b6b" />
      ) : null}
      {row.team_name?.trim() ? (
        <Chip label={row.team_name.trim()} backgroundColor="#faf5ff" borderColor="#e9d5ff" textColor="#6b21a8" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 11, fontWeight: '600' },
});
