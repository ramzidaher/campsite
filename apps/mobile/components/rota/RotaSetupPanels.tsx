import { canTransferRotaOwnership } from '@campsite/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import type { ProfileRow } from '@/lib/AuthContext';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import type { RotaRow } from './RotaShiftEditorModal';

export function RotaManagePanelMobile({
  profile,
  departments,
  managedDeptIds,
  rotas,
  onRotasChange,
}: {
  profile: ProfileRow;
  departments: { id: string; name: string }[];
  managedDeptIds: string[];
  rotas: RotaRow[];
  onRotasChange: (r: RotaRow[]) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('New rota');
  const [kind, setKind] = useState('shift');
  const [deptId, setDeptId] = useState('');
  const [newRotaStatus, setNewRotaStatus] = useState<'draft' | 'published'>('published');
  const [msg, setMsg] = useState<string | null>(null);
  const [xferRota, setXferRota] = useState('');
  const [xferUser, setXferUser] = useState('');

  const staffQuery = useQuery({
    queryKey: ['mobile-rota-setup-staff', profile.org_id],
    enabled: open && Boolean(profile.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name')
        .eq('org_id', profile.org_id!)
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const deptOpts =
    profile.role === 'manager'
      ? departments.filter((d) => managedDeptIds.includes(d.id))
      : departments;

  async function createRota() {
    setMsg(null);
    if (profile.role === 'manager' && !deptId) {
      setMsg(
        'Choose a department you manage. Managers can only create rotas tied to one of their departments.',
      );
      return;
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('rotas')
      .insert({
        org_id: profile.org_id!,
        title: title.trim() || 'Rota',
        kind,
        owner_id: profile.id,
        dept_id: deptId || null,
        status: newRotaStatus,
        published_at: newRotaStatus === 'published' ? new Date().toISOString() : null,
      })
      .select('id,title,kind,dept_id,status')
      .single();
    if (error) {
      setMsg(friendlyDbError(error.message));
      return;
    }
    onRotasChange([...rotas, data as RotaRow]);
    void qc.invalidateQueries({ queryKey: ['mobile-rota-meta'] });
    setOpen(false);
  }

  async function transfer() {
    setMsg(null);
    if (!xferRota || !xferUser) {
      setMsg('Pick rota and new owner.');
      return;
    }
    const supabase = getSupabase();
    const { error } = await supabase.rpc('rota_transfer_owner', {
      p_rota_id: xferRota,
      p_new_owner_id: xferUser,
    });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      setXferRota('');
      setXferUser('');
      const { data } = await supabase
        .from('rotas')
        .select('id,title,kind,dept_id,status')
        .eq('org_id', profile.org_id!)
        .order('title');
      onRotasChange((data ?? []) as RotaRow[]);
      void qc.invalidateQueries({ queryKey: ['mobile-rota-meta'] });
    }
  }

  async function setRotaStatus(rotaId: string, status: 'draft' | 'published') {
    setMsg(null);
    const supabase = getSupabase();
    const { error } = await supabase
      .from('rotas')
      .update({
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      .eq('id', rotaId);
    if (error) setMsg(friendlyDbError(error.message));
    else {
      const { data } = await supabase
        .from('rotas')
        .select('id,title,kind,dept_id,status')
        .eq('org_id', profile.org_id!)
        .order('title');
      onRotasChange((data ?? []) as RotaRow[]);
      void qc.invalidateQueries({ queryKey: ['mobile-rota-meta'] });
    }
  }

  const staff = staffQuery.data ?? [];

  return (
    <View style={styles.setupCard}>
      <Pressable onPress={() => setOpen(!open)}>
        <Text style={styles.setupToggle}>{open ? 'Hide rota admin tools' : 'Show rota admin tools'}</Text>
      </Pressable>
      {open ? (
        <ScrollView style={{ marginTop: 16 }} nestedScrollEnabled>
          <Text style={styles.blockTitle}>Create rota</Text>
          <Text style={styles.blockHint}>
            {profile.role === 'manager'
              ? 'Pick a department you manage — required for your role.'
              : 'Department is optional for org admins and coordinators.'}
          </Text>
          <Text style={styles.label}>Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} />
          <Text style={styles.label}>Kind</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={kind} onValueChange={setKind}>
              <Picker.Item label="Shift" value="shift" />
              <Picker.Item label="Activity" value="activity" />
              <Picker.Item label="Reception" value="reception" />
              <Picker.Item label="Other" value="other" />
            </Picker>
          </View>
          <Text style={styles.label}>Department</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={deptId} onValueChange={setDeptId}>
              <Picker.Item label="-" value="" />
              {deptOpts.map((d) => (
                <Picker.Item key={d.id} label={d.name} value={d.id} />
              ))}
            </Picker>
          </View>
          <Text style={styles.label}>Visibility</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={newRotaStatus}
              onValueChange={(v) => setNewRotaStatus(v as 'draft' | 'published')}
            >
              <Picker.Item label="Published" value="published" />
              <Picker.Item label="Draft" value="draft" />
            </Picker>
          </View>
          <Pressable style={styles.btnPrimary} onPress={() => void createRota()}>
            <Text style={styles.btnPrimaryText}>Create rota</Text>
          </Pressable>

          {canTransferRotaOwnership(profile.role) ? (
            <>
              <Text style={[styles.blockTitle, { marginTop: 24 }]}>Transfer ownership</Text>
              <Text style={styles.blockHint}>Org admin only.</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={xferRota} onValueChange={setXferRota}>
                  <Picker.Item label="Rota" value="" />
                  {rotas.map((r) => (
                    <Picker.Item key={r.id} label={r.title} value={r.id} />
                  ))}
                </Picker>
              </View>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={xferUser} onValueChange={setXferUser}>
                  <Picker.Item label="New owner" value="" />
                  {staff.map((s) => (
                    <Picker.Item key={s.id} label={s.full_name} value={s.id} />
                  ))}
                </Picker>
              </View>
              {staffQuery.isPending ? <ActivityIndicator /> : null}
              <Pressable style={styles.btnPrimary} onPress={() => void transfer()}>
                <Text style={styles.btnPrimaryText}>Transfer</Text>
              </Pressable>
            </>
          ) : null}

          {rotas.length > 0 ? (
            <>
              <Text style={[styles.blockTitle, { marginTop: 24 }]}>Draft or published</Text>
              {rotas.map((r) => (
                <View key={r.id} style={styles.rotaRow}>
                  <Text style={{ flex: 1, fontWeight: '600' }}>{r.title}</Text>
                  <View style={styles.pickerWrapSmall}>
                    <Picker
                      selectedValue={r.status === 'draft' ? 'draft' : 'published'}
                      onValueChange={(v) => void setRotaStatus(r.id, v as 'draft' | 'published')}
                    >
                      <Picker.Item label="Published" value="published" />
                      <Picker.Item label="Draft" value="draft" />
                    </Picker>
                  </View>
                </View>
              ))}
            </>
          ) : null}

          {msg ? <Text style={styles.err}>{msg}</Text> : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

export function RotaMembersPanelMobile({
  rotas,
  staff,
}: {
  rotas: { id: string; title: string }[];
  staff: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [rotaId, setRotaId] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const nameById = new Map(staff.map((s) => [s.id, s.full_name]));

  const membersQuery = useQuery({
    queryKey: ['mobile-rota-members', rotaId],
    enabled: open && Boolean(rotaId && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('rota_members').select('user_id').eq('rota_id', rotaId);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id as string);
    },
  });

  const currentMembers = membersQuery.data ?? [];

  const addMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.from('rota_members').insert({ rota_id: rotaId, user_id: addUserId });
      if (error) throw new Error(friendlyDbError(error.message));
    },
    onSuccess: () => {
      setAddUserId('');
      void membersQuery.refetch();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (userId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from('rota_members').delete().eq('rota_id', rotaId).eq('user_id', userId);
      if (error) throw new Error(friendlyDbError(error.message));
    },
    onSuccess: () => void membersQuery.refetch(),
    onError: (e: Error) => setMsg(e.message),
  });

  if (rotas.length === 0) return null;

  return (
    <View style={styles.setupCard}>
      <Pressable onPress={() => setOpen(!open)}>
        <Text style={styles.setupToggle}>{open ? 'Hide roster visibility' : 'Show roster visibility'}</Text>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.blockHint}>
            Invited people can see this rota’s shifts even when they are not assigned a slot yet.
          </Text>
          <Text style={styles.label}>Rota</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={rotaId}
              onValueChange={(v) => {
                setRotaId(v);
                setMsg(null);
              }}
            >
              <Picker.Item label="-" value="" />
              {rotas.map((r) => (
                <Picker.Item key={r.id} label={r.title} value={r.id} />
              ))}
            </Picker>
          </View>
          {rotaId ? (
            <>
              <Text style={styles.label}>Add person</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={[styles.pickerWrap, { flex: 1 }]}>
                  <Picker selectedValue={addUserId} onValueChange={setAddUserId}>
                    <Picker.Item label="-" value="" />
                    {staff
                      .filter((s) => !currentMembers.includes(s.id))
                      .map((s) => (
                        <Picker.Item key={s.id} label={s.full_name} value={s.id} />
                      ))}
                  </Picker>
                </View>
                <Pressable
                  style={[styles.btnPrimary, { paddingHorizontal: 12 }]}
                  onPress={() => addUserId && addMut.mutate()}
                  disabled={!addUserId}
                >
                  <Text style={styles.btnPrimaryText}>Add</Text>
                </Pressable>
              </View>
              {membersQuery.isPending ? (
                <ActivityIndicator />
              ) : currentMembers.length === 0 ? (
                <Text style={styles.blockHint}>No invited members yet.</Text>
              ) : (
                currentMembers.map((uid) => (
                  <View key={uid} style={styles.memberRow}>
                    <Text style={{ flex: 1 }}>{nameById.get(uid) ?? uid}</Text>
                    <Pressable onPress={() => removeMut.mutate(uid)}>
                      <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Remove</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </>
          ) : null}
          {msg ? <Text style={styles.err}>{msg}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  setupCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e2dc',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 16,
  },
  setupToggle: { fontSize: 14, fontWeight: '600', color: '#5c5c5c' },
  blockTitle: { fontSize: 17, fontWeight: '600', color: '#121212' },
  blockHint: { fontSize: 13, color: '#6b6b6b', marginTop: 6, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#6b6b6b', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d4d2cc',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    fontSize: 14,
  },
  pickerWrap: { borderWidth: 1, borderColor: '#d4d2cc', borderRadius: 8, marginTop: 6, overflow: 'hidden' },
  pickerWrapSmall: { borderWidth: 1, borderColor: '#d4d2cc', borderRadius: 8, minWidth: 140, flex: 1, overflow: 'hidden' },
  btnPrimary: {
    marginTop: 12,
    backgroundColor: '#121212',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#faf9f6', fontWeight: '600' },
  rotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d4d2cc',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#faf9f6',
    borderWidth: 1,
    borderColor: '#ebe9e4',
  },
  err: { color: '#b91c1c', marginTop: 12 },
});
