import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { PixelIcon } from './PixelIcon';
import { backdropIn, backdropOut, cardIn, cardOut } from './motion';
import {
  getAudioPermissionState,
  loadDeviceAudioFiles,
  pickAndScanAudioFolder,
  requestAudioPermission,
  supportsDeviceAudioLibrary,
  supportsFolderScan,
  type DeviceAudioFile,
} from '../../services/documentPicker';
import { formatAudioTime } from '../../game/engine';
import { FONTS } from '../../theme/pixel';

import { C, alpha } from '../../theme/palette';
interface AudioLibrarySheetProps {
  /** Source URIs of songs already in the library (shown as "Added"). */
  importedUris: Set<string>;
  /** Imports one file; the sheet calls it for each selected song in turn. */
  onImportFile: (file: DeviceAudioFile) => Promise<void>;
  /** Called after an import finishes, with how many songs were added. */
  onImported: (count: number, failed: number) => void;
  /** Fall back to the system picker for a single file. */
  onBrowseFiles: () => void;
  onClose: () => void;
  /** Pick exactly one song (Create song form) instead of importing several. */
  single?: boolean;
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'prompt'; blocked?: boolean; note?: string }
  | { kind: 'libraryUnavailable'; note?: string }
  | { kind: 'scanning' }
  | { kind: 'ready'; files: DeviceAudioFile[]; folderName?: string }
  | { kind: 'importing'; done: number; total: number };

/**
 * "From Storage" — works like a music app:
 *  1. asks for permission (our explanation first, then the system dialog),
 *  2. scans the phone for every audio file automatically,
 *  3. lets the user tick the songs to add and imports them in one go.
 */
export function AudioLibrarySheet({
  importedUris,
  onImportFile,
  onImported,
  onBrowseFiles,
  onClose,
  single = false,
}: AudioLibrarySheetProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const scanLibrary = useCallback(async () => {
    setPhase({ kind: 'scanning' });
    const r = await loadDeviceAudioFiles();
    if (r.status === 'ok') setPhase({ kind: 'ready', files: r.files });
    else setPhase({ kind: 'libraryUnavailable' });
  }, []);

  // On open: if access was granted before, scan straight away
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supportsDeviceAudioLibrary) {
        if (!cancelled) setPhase({ kind: supportsFolderScan ? 'libraryUnavailable' : 'prompt' });
        return;
      }
      const state = await getAudioPermissionState();
      if (cancelled) return;
      if (state === 'granted') await scanLibrary();
      else if (state === 'unavailable') setPhase({ kind: 'libraryUnavailable' });
      else setPhase({ kind: 'prompt', blocked: state === 'blocked' });
    })();
    return () => {
      cancelled = true;
    };
  }, [scanLibrary]);

  /** User agreed on our screen → show the system permission dialog, then scan. */
  const handleAllow = async () => {
    const state = await requestAudioPermission();
    if (state === 'granted') await scanLibrary();
    else if (state === 'unavailable') setPhase({ kind: 'libraryUnavailable' });
    else
      setPhase({
        kind: 'prompt',
        blocked: state === 'blocked',
        note: 'Permission was not granted, so TilePulse can’t see your music yet.',
      });
  };

  const handleScanFolder = async () => {
    setPhase({ kind: 'scanning' });
    const r = await pickAndScanAudioFolder();
    if (r.status === 'ok') setPhase({ kind: 'ready', files: r.files, folderName: r.folderName });
    else
      setPhase({
        kind: 'libraryUnavailable',
        note: r.status === 'canceled' ? undefined : 'That folder couldn’t be scanned. Try another one.',
      });
  };

  const allFiles = phase.kind === 'ready' ? phase.files : [];
  const selectableFiles = useMemo(
    () => allFiles.filter((f) => !importedUris.has(f.uri)),
    [allFiles, importedUris]
  );

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allFiles.filter((f) => f.name.toLowerCase().includes(q)) : allFiles;
  }, [allFiles, query]);

  const toggle = (uri: string) =>
    setSelected((prev) => {
      if (single) return prev.has(uri) ? new Set() : new Set([uri]);
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });

  const allSelected = selectableFiles.length > 0 && selectableFiles.every((f) => selected.has(f.uri));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableFiles.map((f) => f.uri)));

  const handleAddSelected = async () => {
    const toAdd = allFiles.filter((f) => selected.has(f.uri));
    if (toAdd.length === 0) return;
    let added = 0;
    let failed = 0;
    for (let i = 0; i < toAdd.length; i++) {
      setPhase({ kind: 'importing', done: i, total: toAdd.length });
      try {
        await onImportFile(toAdd[i]);
        added++;
      } catch (err) {
        console.warn('Import failed for', toAdd[i].name, err);
        failed++;
      }
    }
    onImported(added, failed);
  };

  const renderBody = () => {
    switch (phase.kind) {
      case 'checking':
        return (
          <View style={styles.centerBox}>
            <ActivityIndicator color={C.blue} />
          </View>
        );

      case 'prompt':
        return (
          <Animated.View entering={FadeIn.duration(200)} style={styles.centerBox}>
            <View style={styles.bigIcon}>
              <PixelIcon name="shield" size={28} color={C.blue} />
            </View>
            <Text style={styles.infoTitle}>Find the music on your phone?</Text>
            <Text style={styles.infoText}>
              TilePulse needs permission to access your files so it can scan your phone for songs.
              It only looks for audio files, and nothing leaves your device.
            </Text>
            {phase.note ? <Text style={styles.noteText}>{phase.note}</Text> : null}
            <PressableScale
              style={styles.primaryBtn}
              onPress={phase.blocked ? () => Linking.openSettings() : handleAllow}
            >
              {phase.blocked ? <PixelIcon name="gear" size={14} color={C.textStrong} /> : <PixelIcon name="shield" size={14} color={C.textStrong} />}
              <Text style={styles.primaryText}>{phase.blocked ? 'Open Settings' : 'Allow access'}</Text>
            </PressableScale>
          </Animated.View>
        );

      case 'libraryUnavailable':
        return (
          <Animated.View entering={FadeIn.duration(200)} style={styles.centerBox}>
            <View style={styles.bigIcon}>
              <PixelIcon name="folder" size={28} color={C.blue} />
            </View>
            <Text style={styles.infoTitle}>Music library not available here</Text>
            <Text style={styles.infoText}>
              {supportsDeviceAudioLibrary
                ? 'Expo Go isn’t allowed to read your phone’s music library — the installed app is. For now, choose a folder (like Music or Download) and TilePulse will scan it and its subfolders for songs.'
                : 'Choose a folder and TilePulse will scan it and its subfolders for songs.'}
            </Text>
            {phase.note ? <Text style={styles.noteText}>{phase.note}</Text> : null}
            <PressableScale style={styles.primaryBtn} onPress={handleScanFolder}>
              <PixelIcon name="folder" size={14} color={C.textStrong} />
              <Text style={styles.primaryText}>Choose a folder to scan</Text>
            </PressableScale>
          </Animated.View>
        );

      case 'scanning':
        return (
          <View style={styles.centerBox}>
            <ActivityIndicator color={C.blue} />
            <Text style={styles.infoText}>Scanning for songs…</Text>
          </View>
        );

      case 'importing':
        return (
          <View style={styles.centerBox}>
            <ActivityIndicator color={C.blue} />
            <Text style={styles.infoTitle}>
              Adding {phase.done + 1} of {phase.total}…
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(phase.done / phase.total) * 100}%` }]} />
            </View>
          </View>
        );

      case 'ready':
        if (visibleFiles.length === 0) {
          return (
            <View style={styles.centerBox}>
              <Text style={styles.infoText}>
                {query ? 'No songs match your search.' : 'No songs found.'}
              </Text>
            </View>
          );
        }
        return (
          <FlatList
            data={visibleFiles}
            keyExtractor={(f) => f.id}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={16}
            windowSize={9}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const added = importedUris.has(item.uri);
              const checked = selected.has(item.uri);
              return (
                <PressableScale
                  scaleTo={0.98}
                  disabled={added}
                  style={[styles.fileRow, checked && styles.fileRowChecked, added && styles.fileRowAdded]}
                  onPress={() => toggle(item.uri)}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked && <PixelIcon name="check" size={14} color={C.textStrong} />}
                  </View>
                  <PixelIcon name="note" size={14} color={added ? C.textFaint : C.blue} />
                  <Text style={[styles.fileName, added && styles.fileNameAdded]} numberOfLines={1}>
                    {item.name.replace(/\.[^/.]+$/, '')}
                  </Text>
                  {added ? (
                    <Text style={styles.addedTag}>ADDED</Text>
                  ) : item.durationSeconds > 0 ? (
                    <Text style={styles.fileDuration}>{formatAudioTime(item.durationSeconds)}</Text>
                  ) : null}
                </PressableScale>
              );
            }}
          />
        );
    }
  };

  const selectedCount = selected.size;

  return (
    <Animated.View entering={backdropIn} exiting={backdropOut} style={styles.backdrop}>
      <Animated.View entering={cardIn} exiting={cardOut} style={styles.sheet}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <PixelIcon name="note" size={14} color={C.blue} />
            <Text style={styles.title}>Songs on your phone</Text>
          </View>
          {phase.kind !== 'importing' && (
            <PressableScale scaleTo={0.85} onPress={onClose} accessibilityLabel="Close">
              <PixelIcon name="close" size={21} color={C.textDim} />
            </PressableScale>
          )}
        </View>

        {phase.kind === 'ready' && (
          <>
            <View style={styles.toolbarRow}>
              <Text style={styles.sourceText} numberOfLines={1}>
                {phase.files.length} songs
                {phase.folderName ? ` in “${phase.folderName}”` : ' found'}
              </Text>
              {!single && selectableFiles.length > 0 && (
                <PressableScale scaleTo={0.92} style={styles.selectAllBtn} onPress={toggleAll}>
                  <PixelIcon name="check" size={14} color={C.blue} />
                  <Text style={styles.selectAllText}>{allSelected ? 'Clear' : 'Select all'}</Text>
                </PressableScale>
              )}
            </View>
            <View style={styles.searchBox}>
              <PixelIcon name="discover" size={18} color={C.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search songs"
                placeholderTextColor={C.textMuted}
                style={styles.searchInput}
              />
            </View>
          </>
        )}

        <View style={styles.body}>{renderBody()}</View>

        {phase.kind === 'ready' ? (
          <PressableScale
            style={[styles.addBtn, selectedCount === 0 && styles.addBtnDisabled]}
            disabled={selectedCount === 0}
            onPress={handleAddSelected}
          >
            <PixelIcon name="check" size={14} color={C.textStrong} />
            <Text style={styles.addText}>
              {single
                ? selectedCount === 0
                  ? 'Select a song'
                  : 'Use this song'
                : selectedCount === 0
                  ? 'Select songs to add'
                  : `Add ${selectedCount} song${selectedCount === 1 ? '' : 's'}`}
            </Text>
          </PressableScale>
        ) : phase.kind !== 'importing' ? (
          <PressableScale style={styles.secondaryBtn} onPress={onBrowseFiles}>
            <PixelIcon name="folder" size={14} color={C.textSoft} />
            <Text style={styles.secondaryText}>Pick a single file instead</Text>
          </PressableScale>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
    elevation: 300,
    backgroundColor: alpha(C.black, 0.75),
  },
  sheet: {
    flex: 1,
    marginTop: 24,
    backgroundColor: C.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: C.panelLight,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: C.textStrong,
    fontFamily: FONTS.pixel,
    fontSize: 11,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sourceText: {
    flex: 1,
    color: C.textMuted,
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 0,
    backgroundColor: alpha(C.blue, 0.12),
  },
  selectAllText: {
    color: C.blue,
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 0,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 19,
    paddingVertical: 10,
  },
  body: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 4,
    gap: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.panelLight,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fileRowChecked: {
    borderColor: C.accent,
    backgroundColor: alpha(C.accent, 0.12),
  },
  fileRowAdded: {
    opacity: 0.55,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: C.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  fileName: {
    flex: 1,
    color: C.text,
    fontFamily: FONTS.body,
    fontSize: 19,
  },
  fileNameAdded: {
    color: C.textMuted,
  },
  addedTag: {
    color: C.textMuted,
    fontFamily: FONTS.body,
    fontSize: 13,
    letterSpacing: 1,
  },
  fileDuration: {
    color: C.textMuted,
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  bigIcon: {
    width: 60,
    height: 60,
    borderRadius: 0,
    backgroundColor: alpha(C.blue, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  infoTitle: {
    color: C.textStrong,
    fontFamily: FONTS.pixel,
    fontSize: 11,
    textAlign: 'center',
  },
  infoText: {
    color: C.textDim,
    fontFamily: FONTS.body,
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 18,
  },
  noteText: {
    color: C.accent,
    fontFamily: FONTS.body,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 0,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 8,
  },
  primaryText: {
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 19,
  },
  progressTrack: {
    width: 180,
    height: 4,
    borderRadius: 0,
    backgroundColor: C.panelLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.blue,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 0,
    paddingVertical: 14,
    marginTop: 8,
  },
  addBtnDisabled: {
    backgroundColor: C.panelLight,
  },
  addText: {
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 20,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.panelLight,
    borderRadius: 0,
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryText: {
    color: C.textSoft,
    fontFamily: FONTS.body,
    fontSize: 17,
  },
});
