/**
 * Asks a moderator for the reason before an action (remove a level / comment,
 * warn or ban a player). The reason is sent to the player in their inbox.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { PressableScale } from './PressableScale';
import { FONTS, PIXEL } from '../../theme/pixel';

import { C, alpha } from '../../theme/palette';
const MAX = 300;

interface Props {
  visible: boolean;
  title: string;
  /** One line explaining what will happen. */
  message: string;
  confirmLabel: string;
  /** Quick picks that fill the text box. */
  presets?: string[];
  /** Red confirm button for removals and bans. */
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

export function ReasonModal({ visible, title, message, confirmLabel, presets = [], destructive, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const ok = reason.trim().length >= 3;
  const confirm = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {presets.length ? (
            <View style={styles.presets}>
              {presets.map((p) => (
                <PressableScale key={p} scaleTo={0.94} onPress={() => setReason(p)} style={[styles.preset, reason === p && styles.presetOn]}>
                  <Text style={[styles.presetText, reason === p && styles.presetTextOn]}>{p}</Text>
                </PressableScale>
              ))}
            </View>
          ) : null}
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (the player will see it)"
            placeholderTextColor={C.textMuted}
            maxLength={MAX}
            multiline
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <PressableScale scaleTo={0.95} onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </PressableScale>
            <PressableScale
              scaleTo={0.95}
              disabled={!ok || busy}
              onPress={confirm}
              style={[styles.confirm, destructive && styles.confirmDanger, (!ok || busy) && styles.disabled]}
            >
              {busy ? <ActivityIndicator size="small" color={destructive ? C.textStrong : C.onAccent} /> : null}
              <Text style={[styles.confirmText, destructive && styles.confirmTextDanger]}>{confirmLabel}</Text>
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: alpha(C.black, 0.7), justifyContent: 'center', padding: 20 },
  card: { backgroundColor: PIXEL.panel, borderWidth: 3, borderColor: C.outline, padding: 16, gap: 10 },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 11 },
  message: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: { borderWidth: 2, borderColor: PIXEL.panelLight, paddingHorizontal: 8, paddingVertical: 5 },
  presetOn: { borderColor: PIXEL.accent2, backgroundColor: alpha(C.blue, 0.15) },
  presetText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  presetTextOn: { color: C.textStrong },
  input: {
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 19,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancel: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: PIXEL.panelLight },
  cancelText: { color: PIXEL.textDim, fontFamily: FONTS.pixel, fontSize: 8 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: PIXEL.accent2, borderWidth: 2, borderColor: C.outline },
  confirmDanger: { backgroundColor: C.danger },
  confirmText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 8 },
  confirmTextDanger: { color: C.textStrong },
  disabled: { opacity: 0.45 },
});
