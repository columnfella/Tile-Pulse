import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Check,
  CheckCheck,
  FileAudio,
  FolderOpen,
  FolderSearch,
  Music2,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { PressableScale } from './PressableScale';
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
            <ActivityIndicator color="#38bdf8" />
          </View>
        );

      case 'prompt':
        return (
          <Animated.View entering={FadeIn.duration(200)} style={styles.centerBox}>
            <View style={styles.bigIcon}>
              <ShieldCheck size={28} color="#38bdf8" />
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
              {phase.blocked ? <Settings size={14} color="#fff" /> : <ShieldCheck size={14} color="#fff" />}
              <Text style={styles.primaryText}>{phase.blocked ? 'Open Settings' : 'Allow access'}</Text>
            </PressableScale>
          </Animated.View>
        );

      case 'libraryUnavailable':
        return (
          <Animated.View entering={FadeIn.duration(200)} style={styles.centerBox}>
            <View style={styles.bigIcon}>
              <FolderSearch size={28} color="#38bdf8" />
            </View>
            <Text style={styles.infoTitle}>Music library not available here</Text>
            <Text style={styles.infoText}>
              {supportsDeviceAudioLibrary
                ? 'Expo Go isn’t allowed to read your phone’s music library — the installed app is. For now, choose a folder (like Music or Download) and TilePulse will scan it and its subfolders for songs.'
                : 'Choose a folder and TilePulse will scan it and its subfolders for songs.'}
            </Text>
            {phase.note ? <Text style={styles.noteText}>{phase.note}</Text> : null}
            <PressableScale style={styles.primaryBtn} onPress={handleScanFolder}>
              <FolderSearch size={14} color="#fff" />
              <Text style={styles.primaryText}>Choose a folder to scan</Text>
            </PressableScale>
          </Animated.View>
        );

      case 'scanning':
        return (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={styles.infoText}>Scanning for songs…</Text>
          </View>
        );

      case 'importing':
        return (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#38bdf8" />
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
                    {checked && <Check size={12} color="#ffffff" strokeWidth={3} />}
                  </View>
                  <FileAudio size={16} color={added ? '#475569' : '#38bdf8'} />
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
            <Music2 size={16} color="#38bdf8" />
            <Text style={styles.title}>Songs on your phone</Text>
          </View>
          {phase.kind !== 'importing' && (
            <PressableScale scaleTo={0.85} onPress={onClose} accessibilityLabel="Close">
              <X size={18} color="#94a3b8" />
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
              {selectableFiles.length > 0 && (
                <PressableScale scaleTo={0.92} style={styles.selectAllBtn} onPress={toggleAll}>
                  <CheckCheck size={12} color="#38bdf8" />
                  <Text style={styles.selectAllText}>{allSelected ? 'Clear' : 'Select all'}</Text>
                </PressableScale>
              )}
            </View>
            <View style={styles.searchBox}>
              <Search size={14} color="#64748b" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search songs"
                placeholderTextColor="#64748b"
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
            <Check size={15} color="#ffffff" strokeWidth={3} />
            <Text style={styles.addText}>
              {selectedCount === 0
                ? 'Select songs to add'
                : `Add ${selectedCount} song${selectedCount === 1 ? '' : 's'}`}
            </Text>
          </PressableScale>
        ) : phase.kind !== 'importing' ? (
          <PressableScale style={styles.secondaryBtn} onPress={onBrowseFiles}>
            <FolderOpen size={14} color="#cbd5e1" />
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  sheet: {
    flex: 1,
    marginTop: 24,
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
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
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sourceText: {
    flex: 1,
    color: '#64748b',
    fontSize: 11,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  selectAllText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
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
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fileRowChecked: {
    borderColor: '#0284c7',
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
  },
  fileRowAdded: {
    opacity: 0.55,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  fileName: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  fileNameAdded: {
    color: '#64748b',
  },
  addedTag: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  fileDuration: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'monospace',
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
    borderRadius: 20,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  infoTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  infoText: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  noteText: {
    color: '#fbbf24',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 8,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressTrack: {
    width: 180,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  addBtnDisabled: {
    backgroundColor: '#1e293b',
  },
  addText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
});
