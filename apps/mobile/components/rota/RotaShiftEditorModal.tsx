import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';

import type { ProfileRow } from '@/lib/AuthContext';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import { getSupabase } from '@/lib/supabase';

export type RotaRow = { id: string; title: string; kind: string; dept_id: string | null; status: string };

export type ShiftRow = {
  id: string;
  dept_id: string | null;
  rota_id: string | null;
  user_id: string | null;
  role_label: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
  source: string;
  departments: { name: string } | null;
  assignee: { full_name: string } | null;
  rotas: { id: string; title: string; kind: string } | null;
};

type Props = {
  visible: boolean;
  profile: ProfileRow;
  departments: { id: string; name: string }[];
  staff: { id: string; full_name: string }[];
  managedDeptIds: string[];
  rotas: RotaRow[];
  requireRota: boolean;
  prefillAssigneeUserId: string | null;
  editingShift: ShiftRow | null;
  slotPreset: { start: Date; end: Date } | null;
  onClose: () => void;
  onSaved: () => void;
  onRotasUpdated: () => void;
};

export function RotaShiftEditorModal({
  visible,
  profile,
  departments,
  staff,
  managedDeptIds,
  rotas,
  requireRota,
  prefillAssigneeUserId,
  editingShift,
  slotPreset,
  onClose,
  onSaved,
  onRotasUpdated,
}: Props) {
  const [rotaId, setRotaId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [userId, setUserId] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRotaTitle, setNewRotaTitle] = useState('');
  const [newRotaKind, setNewRotaKind] = useState('shift');
  const [newRotaDept, setNewRotaDept] = useState('');

  const isEdit = Boolean(editingShift);

  useEffect(() => {
    if (!visible) return;
    setMsg(null);
    if (editingShift) {
      setRotaId(editingShift.rota_id ?? '');
      setDeptId(editingShift.dept_id ?? '');
      setUserId(editingShift.user_id ?? '');
      setRoleLabel(editingShift.role_label ?? '');
      setNotes(editingShift.notes ?? '');
      setStartDate(new Date(editingShift.start_time));
      setEndDate(new Date(editingShift.end_time));
    } else if (slotPreset) {
      setRotaId('');
      setDeptId(profile.role === 'manager' && managedDeptIds.length === 1 ? managedDeptIds[0]! : '');
      setUserId(prefillAssigneeUserId ?? '');
      setRoleLabel('');
      setNotes('');
      setStartDate(slotPreset.start);
      setEndDate(slotPreset.end);
    } else {
      setRotaId('');
      setDeptId('');
      setUserId(prefillAssigneeUserId ?? '');
      setRoleLabel('');
      setNotes('');
      setStartDate(new Date());
      setEndDate(new Date(Date.now() + 3600000));
    }
  }, [visible, editingShift, slotPreset, profile.role, managedDeptIds, prefillAssigneeUserId]);

  const deptOptions =
    profile.role === 'manager'
      ? departments.filter((d) => managedDeptIds.includes(d.id))
      : departments;

  async function save() {
    setMsg(null);
    if (requireRota && !rotaId) {
      setMsg('Select a rota (coordinators must link shifts to a rota).');
      return;
    }
    if (!deptId && profile.role === 'manager') {
      setMsg('Department is required.');
      return;
    }
    const start = startDate;
    const end = endDate;
    if (end <= start) {
      setMsg('End must be after start.');
      return;
    }
    const assignee = userId || null;
    if (assignee) {
      const supabase = getSupabase();
      let q = supabase
        .from('rota_shifts')
        .select('id')
        .eq('org_id', profile.org_id!)
        .eq('user_id', assignee)
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString())
        .limit(1);
      if (editingShift) q = q.neq('id', editingShift.id);
      const { data: overlap } = await q;
      if (overlap?.length) {
        Alert.alert('Overlap', 'This person already has a shift overlapping this window. Save anyway?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: () => void doSave() },
        ]);
        return;
      }
    }
    await doSave();
  }

  async function doSave() {
    setSaving(true);
    try {
      const supabase = getSupabase();
      const start = startDate;
      const end = endDate;
      const assignee = userId || null;
      if (isEdit && editingShift) {
        const { error } = await supabase
          .from('rota_shifts')
          .update({
            rota_id: rotaId || null,
            dept_id: deptId || null,
            user_id: assignee,
            role_label: roleLabel || null,
            notes: notes || null,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
          })
          .eq('id', editingShift.id);
        if (error) {
          setMsg(friendlyDbError(error.message));
          return;
        }
      } else {
        const { error } = await supabase.from('rota_shifts').insert({
          org_id: profile.org_id!,
          rota_id: rotaId || null,
          dept_id: deptId || null,
          user_id: assignee,
          role_label: roleLabel || null,
          notes: notes || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          source: 'manual',
        });
        if (error) {
          setMsg(friendlyDbError(error.message));
          return;
        }
      }
      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function removeShift() {
    if (!editingShift) return;
    Alert.alert('Delete shift?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const supabase = getSupabase();
          const { error } = await supabase.from('rota_shifts').delete().eq('id', editingShift.id);
          if (error) {
            Alert.alert('Error', friendlyDbError(error.message));
            return;
          }
          onClose();
          onSaved();
        },
      },
    ]);
  }

  async function createRotaInline() {
    setMsg(null);
    if (profile.role === 'manager' && !newRotaDept) {
      setMsg('Pick a department for the new rota.');
      return;
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('rotas')
      .insert({
        org_id: profile.org_id!,
        title: newRotaTitle.trim() || 'Rota',
        kind: newRotaKind,
        owner_id: profile.id,
        dept_id: newRotaDept || null,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) {
      setMsg(friendlyDbError(error.message));
      return;
    }
    setRotaId((data as { id: string }).id);
    onRotasUpdated();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{isEdit ? 'Edit shift' : 'New shift'}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeLink}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Rota {requireRota ? '(required)' : '(optional)'}</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={rotaId} onValueChange={setRotaId}>
              <Picker.Item label="-" value="" />
              {rotas.map((r) => (
                <Picker.Item
                  key={r.id}
                  label={`${r.title} (${r.kind})${r.status === 'draft' ? ' draft' : ''}`}
                  value={r.id}
                />
              ))}
            </Picker>
          </View>

          {!isEdit ? (
            <View style={styles.inlineRota}>
              <Text style={styles.label}>Need a new rota?</Text>
              <TextInput
                style={styles.input}
                placeholder="Title"
                value={newRotaTitle}
                onChangeText={setNewRotaTitle}
              />
              <View style={styles.pickerWrap}>
                <Picker selectedValue={newRotaKind} onValueChange={setNewRotaKind}>
                  <Picker.Item label="shift" value="shift" />
                  <Picker.Item label="activity" value="activity" />
                  <Picker.Item label="reception" value="reception" />
                  <Picker.Item label="other" value="other" />
                </Picker>
              </View>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={newRotaDept} onValueChange={setNewRotaDept}>
                  <Picker.Item label="dept" value="" />
                  {deptOptions.map((d) => (
                    <Picker.Item key={d.id} label={d.name} value={d.id} />
                  ))}
                </Picker>
              </View>
              <Pressable style={styles.btnSecondary} onPress={() => void createRotaInline()}>
                <Text>Create & select</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.label}>Department</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={deptId} onValueChange={setDeptId}>
              <Picker.Item label="-" value="" />
              {deptOptions.map((d) => (
                <Picker.Item key={d.id} label={d.name} value={d.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Staff</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={userId} onValueChange={setUserId}>
              <Picker.Item label="Open slot" value="" />
              {staff.map((s) => (
                <Picker.Item key={s.id} label={s.full_name} value={s.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Role label</Text>
          <TextInput style={styles.input} value={roleLabel} onChangeText={setRoleLabel} />

          <Text style={styles.label}>Start</Text>
          <Pressable style={styles.input} onPress={() => setShowStart(true)}>
            <Text>{startDate.toLocaleString()}</Text>
          </Pressable>
          {showStart ? (
            <DateTimePicker
              value={startDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowStart(Platform.OS === 'ios');
                if (d) setStartDate(d);
              }}
            />
          ) : null}

          <Text style={styles.label}>End</Text>
          <Pressable style={styles.input} onPress={() => setShowEnd(true)}>
            <Text>{endDate.toLocaleString()}</Text>
          </Pressable>
          {showEnd ? (
            <DateTimePicker
              value={endDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowEnd(Platform.OS === 'ios');
                if (d) setEndDate(d);
              }}
            />
          ) : null}

          <Text style={styles.label}>Notes</Text>
          <TextInput style={[styles.input, { minHeight: 72 }]} value={notes} onChangeText={setNotes} multiline />

          {msg ? <Text style={styles.err}>{msg}</Text> : null}

          {saving ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          <Pressable style={styles.btnPrimary} onPress={() => void save()} disabled={saving}>
            <Text style={styles.btnPrimaryText}>{isEdit ? 'Save changes' : 'Save shift'}</Text>
          </Pressable>
          {isEdit ? (
            <Pressable style={styles.btnDanger} onPress={() => void removeShift()}>
              <Text style={styles.btnDangerText}>Delete shift</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fff' },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e2dc',
  },
  sheetTitle: { fontSize: 18, fontWeight: '600' },
  closeLink: { fontSize: 15, color: '#5c5c5c' },
  sheetBody: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#6b6b6b', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d4d2cc',
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
    fontSize: 14,
  },
  pickerWrap: { borderWidth: 1, borderColor: '#d4d2cc', borderRadius: 8, marginTop: 6, overflow: 'hidden' },
  inlineRota: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d4d2cc',
    backgroundColor: '#faf9f6',
  },
  btnPrimary: {
    marginTop: 20,
    backgroundColor: '#121212',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#faf9f6', fontWeight: '600' },
  btnSecondary: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d4d2cc',
    alignItems: 'center',
  },
  btnDanger: { marginTop: 12, padding: 12, alignItems: 'center' },
  btnDangerText: { color: '#b91c1c', fontWeight: '600' },
  err: { color: '#b91c1c', marginTop: 8 },
});
