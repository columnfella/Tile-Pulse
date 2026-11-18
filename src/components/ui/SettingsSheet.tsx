/**
 * App settings (the gear on the Songs tab): menu music on / off and volume.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { PixelIcon } from './PixelIcon';
import { PressableScale } from './PressableScale';
import { FONTS, PIXEL } from '../../theme/pixel';
import {
  hasMenuMusic,
  menuTrackCount,
  setMenuMusicSettings,
  skipMenuTrack,
  useMenuMusicSettings,
  useNowPlaying,
  useTrackStart,
} from '../../services/menuMusic';

const VOLUMES = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const music = useMenuMusicSettings();
  const available = hasMenuMusic();
  const tracks = menuTrackCount();
  const nowPlaying = useNowPlaying();
  const credit = useTrackStart()?.track.credit ?? null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Taps inside the card don't close it */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <PixelIcon name="gear" size={16} color={PIXEL.accent} />
              <Text style={styles.title}>SETTINGS</Text>
            </View>
            <PressableScale scaleTo={0.88} style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close settings">
              <PixelIcon name="close" size={12} color="#cdd6ea" />
            </PressableScale>
          </View>

          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.label}>MENU MUSIC</Text>
                <Text style={styles.muted}>Plays on the menus; fades out while you play or edit.</Text>
              </View>
              <Switch
                value={music.enabled}
                onValueChange={(enabled) => setMenuMusicSettings({ enabled })}
                trackColor={{ false: '#2a3654', true: '#2f6bff' }}
                thumbColor={music.enabled ? '#FF6B4A' : '#9aa7c2'}
                accessibilityLabel="Menu music"
              />
            </View>

            <Text style={[styles.label, styles.spaced]}>VOLUME</Text>
            <View style={styles.chips}>
              {VOLUMES.map((v) => {
                const on = Math.abs(music.volume - v.value) < 0.01;
                return (
                  <PressableScale
                    key={v.label}
                    scaleTo={0.92}
                    disabled={!music.enabled}
                    onPress={() => setMenuMusicSettings({ volume: v.value })}
                    style={[styles.chip, on && styles.chipOn, !music.enabled && styles.disabled]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{v.label}</Text>
                  </PressableScale>
                );
              })}
            </View>

            {!available ? (
              <Text style={styles.note}>No menu music is installed in this version yet.</Text>
            ) : (
              <View style={styles.nowRow}>
                <Text style={[styles.note, styles.flex]} numberOfLines={2}>
                  {nowPlaying && music.enabled ? `♪ ${nowPlaying}` : `${tracks} track${tracks === 1 ? '' : 's'}`}
                  {tracks > 1 ? ' · shuffled' : ''}
                </Text>
                {tracks > 1 && music.enabled ? (
                  <PressableScale scaleTo={0.9} onPress={skipMenuTrack} style={styles.chip} accessibilityLabel="Next track">
                    <Text style={styles.chipText}>NEXT ▸</Text>
                  </PressableScale>
                ) : null}
              </View>
            )}
            {available && credit && music.enabled ? (
              <View style={styles.credit}>
                <Text style={styles.creditLine}>
                  “{credit.song}”{credit.composer ? ` by ${credit.composer}` : ''}
                </Text>
                {credit.website ? <Text style={styles.creditLine}>{credit.website}</Text> : null}
                {credit.license ? (
                  <Text style={styles.creditLine}>
                    {credit.license}
                    {credit.licenseUrl ? ` ${credit.licenseUrl}` : ''}
                  </Text>
                ) : null}
                {credit.poweredBy ? (
                  <Text style={styles.creditLine}>
                    {credit.poweredBy}
                    {credit.poweredByUrl ? `: ${credit.poweredByUrl}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: PIXEL.panel, borderWidth: 3, borderColor: '#000000', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 12 },
  closeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: '#000000' },
  section: { backgroundColor: '#070b14', borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, gap: 4 },
  label: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 8 },
  spaced: { marginTop: 8 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: PIXEL.panelLight },
  chipOn: { borderColor: PIXEL.accent, backgroundColor: 'rgba(255,107,74,0.12)' },
  chipText: { color: PIXEL.textDim, fontFamily: FONTS.pixel, fontSize: 7 },
  chipTextOn: { color: PIXEL.accent },
  disabled: { opacity: 0.4 },
  note: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 15, marginTop: 6 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credit: { marginTop: 4, gap: 1 },
  creditLine: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 14 },
});
