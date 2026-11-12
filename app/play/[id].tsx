import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  SafeAreaView,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Song, TileNote } from '../../types/song';
import { HitJudgment, GameStats, ActiveTileState } from '../../types/game';
import { ACTIVE_THEME } from '../../constants/theme';
import {
  calculateNoteTimeSeconds,
  calculateTileY,
  calculateTileHeight,
  evaluateHitJudgment,
  isWithinHitWindow,
  isTilePastMissThreshold,
  calculateHoldProgress,
  calculateOverallAccuracy,
  formatAudioTime,
} from '../../src/game/engine';
import { audioService } from '../../services/audio';
import { storageService } from '../../services/storage';
import { GameBoardBackground } from '../../src/components/game/GameBoardBackground';
import { TapTileView } from '../../src/components/game/TapTileView';
import { HoldTileView } from '../../src/components/game/HoldTileView';
import { HitJudgmentBadge } from '../../src/components/game/HitJudgmentBadge';
import { ComboDisplay } from '../../src/components/game/ComboDisplay';
import { Pause, Play, RotateCcw, Home, Sparkles } from 'lucide-react';

export default function PlayScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(15);

  const [activeLanes, setActiveLanes] = useState<boolean[]>([false, false, false, false]);
  const [laneFlashes, setLaneFlashes] = useState<boolean[]>([false, false, false, false]);

  const [currentJudgment, setCurrentJudgment] = useState<HitJudgment | null>(null);
  const [judgmentTimeDiff, setJudgmentTimeDiff] = useState<number | undefined>(undefined);
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    maxScore: 0,
    combo: 0,
    maxCombo: 0,
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    missCount: 0,
    totalNotes: 0,
    accuracy: 100,
  });

  const tileStatesRef = useRef<Map<string, ActiveTileState>>(new Map());
  const activeHoldByLaneRef = useRef<Map<number, string>>(new Map());
  const animFrameIdRef = useRef<number | null>(null);

  const windowHeight = Dimensions.get('window').height || 640;
  const { geometry } = ACTIVE_THEME;
  const pixelsPerBeat = geometry.pixelsPerBeat;
  const hitLineY = Math.round(windowHeight * (geometry.hitLineYPercent / 100));

  // Load song from storage
  useEffect(() => {
    async function init() {
      const target = await storageService.getSongById(id || '');
      if (target) {
        setSong(target);
        setAudioDuration(target.durationSeconds || 15);
        setStats({
          score: 0,
          maxScore: target.tiles.length * 1000,
          combo: 0,
          maxCombo: 0,
          perfectCount: 0,
          greatCount: 0,
          goodCount: 0,
          missCount: 0,
          totalNotes: target.tiles.length,
          accuracy: 100,
        });

        const states = new Map<string, ActiveTileState>();
        target.tiles.forEach((t) => {
          states.set(t.id, {
            status: 'pending',
            heldBeats: 0,
            holdProgress: 0,
          });
        });
        tileStatesRef.current = states;

        // Start audio playback
        const uri = await storageService.getAudioUriForSong(target);
        await audioService.loadTrack(target.id, uri, target.bpm, target.durationSeconds);
        audioService.play(0);
      }
    }
    init();

    return () => {
      audioService.stop();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [id]);

  const registerHit = useCallback(
    (tileId: string, judgment: HitJudgment, score: number, timeDiffMs?: number) => {
      setCurrentJudgment(judgment);
      setJudgmentTimeDiff(timeDiffMs);

      setStats((prev) => {
        const isHit = judgment !== 'MISS';
        const newCombo = isHit ? prev.combo + 1 : 0;
        const newMaxCombo = Math.max(prev.maxCombo, newCombo);
        const perfectCount = prev.perfectCount + (judgment === 'PERFECT' ? 1 : 0);
        const greatCount = prev.greatCount + (judgment === 'GREAT' ? 1 : 0);
        const goodCount = prev.goodCount + (judgment === 'GOOD' ? 1 : 0);
        const missCount = prev.missCount + (judgment === 'MISS' ? 1 : 0);
        const newScore = prev.score + score;

        const newAccuracy = calculateOverallAccuracy({
          perfectCount,
          greatCount,
          goodCount,
          missCount,
          totalNotes: prev.totalNotes,
        });

        return {
          ...prev,
          score: newScore,
          combo: newCombo,
          maxCombo: newMaxCombo,
          perfectCount,
          greatCount,
          goodCount,
          missCount,
          accuracy: newAccuracy,
        };
      });
    },
    []
  );

  const triggerLaneFlash = (lane: 0 | 1 | 2 | 3) => {
    setLaneFlashes((prev) => {
      const next = [...prev];
      next[lane] = true;
      return next;
    });
    setTimeout(() => {
      setLaneFlashes((prev) => {
        const next = [...prev];
        next[lane] = false;
        return next;
      });
    }, 90);
  };

  const handleLanePressStart = useCallback(
    (lane: 0 | 1 | 2 | 3) => {
      if (isPaused || isCompleted || !song) return;

      setActiveLanes((prev) => {
        const next = [...prev];
        next[lane] = true;
        return next;
      });

      triggerLaneFlash(lane);

      const curAudioTime = audioService.getCurrentTime();
      const laneTiles = song.tiles
        .filter((t) => t.lane === lane)
        .sort((a, b) => a.beat - b.beat);

      let targetTile: TileNote | null = null;
      let minDiff = Infinity;

      for (const t of laneTiles) {
        const state = tileStatesRef.current.get(t.id);
        if (state && (state.status === 'pending' || state.status === 'holding')) {
          const noteTime = calculateNoteTimeSeconds(t.beat, song.bpm);
          const diff = Math.abs(curAudioTime - noteTime);
          if (diff < minDiff && isWithinHitWindow(curAudioTime - noteTime)) {
            minDiff = diff;
            targetTile = t;
          }
        }
      }

      if (targetTile) {
        const noteTime = calculateNoteTimeSeconds(targetTile.beat, song.bpm);
        const timeDiffSec = curAudioTime - noteTime;
        const result = evaluateHitJudgment(timeDiffSec);

        if (targetTile.durationBeats === 0) {
          tileStatesRef.current.set(targetTile.id, {
            status: 'hit',
            heldBeats: 0,
            holdProgress: 1,
          });
          audioService.playHitSound(lane, result.judgment === 'PERFECT');
          registerHit(targetTile.id, result.judgment, result.score, Math.round(timeDiffSec * 1000));
        } else {
          tileStatesRef.current.set(targetTile.id, {
            status: 'holding',
            heldBeats: 0,
            holdProgress: 0,
            holdStartTime: curAudioTime,
          });
          activeHoldByLaneRef.current.set(lane, targetTile.id);
          audioService.playHitSound(lane, true);
        }
      } else {
        audioService.playHitSound(lane, false);
      }
    },
    [isPaused, isCompleted, song, registerHit]
  );

  const handleLanePressEnd = useCallback(
    (lane: 0 | 1 | 2 | 3) => {
      setActiveLanes((prev) => {
        const next = [...prev];
        next[lane] = false;
        return next;
      });

      const holdingTileId = activeHoldByLaneRef.current.get(lane);
      if (holdingTileId && song) {
        activeHoldByLaneRef.current.delete(lane);
        const tile = song.tiles.find((t) => t.id === holdingTileId);
        const state = tileStatesRef.current.get(holdingTileId);

        if (tile && state && state.status === 'holding') {
          const curTime = audioService.getCurrentTime();
          const startNoteTime = calculateNoteTimeSeconds(tile.beat, song.bpm);
          const durationSeconds = (tile.durationBeats * 60) / song.bpm;
          const progress = calculateHoldProgress(curTime, startNoteTime, durationSeconds);

          if (progress >= 0.85) {
            state.status = 'hit';
            state.holdProgress = 1;
            registerHit(tile.id, 'PERFECT', 1000);
          } else {
            state.status = 'missed';
            state.holdProgress = progress;
            registerHit(tile.id, 'MISS', 0);
          }
        }
      }
    },
    [song, registerHit]
  );

  // Audio-Synced Game Loop
  useEffect(() => {
    if (isPaused || isCompleted || !song) return;

    let lastTickTime = 0;

    const gameLoop = () => {
      const curTime = audioService.getCurrentTime();
      setAudioCurrentTime(curTime);

      // Check active hold notes
      activeHoldByLaneRef.current.forEach((tileId, lane) => {
        const tile = song.tiles.find((t) => t.id === tileId);
        const state = tileStatesRef.current.get(tileId);
        if (tile && state && state.status === 'holding') {
          const startNoteTime = calculateNoteTimeSeconds(tile.beat, song.bpm);
          const durationSeconds = (tile.durationBeats * 60) / song.bpm;
          const progress = calculateHoldProgress(curTime, startNoteTime, durationSeconds);
          state.holdProgress = progress;

          if (curTime - lastTickTime > 0.15) {
            audioService.playHoldTick(progress);
            lastTickTime = curTime;
          }

          if (progress >= 1.0) {
            state.status = 'hit';
            activeHoldByLaneRef.current.delete(lane);
            registerHit(tile.id, 'PERFECT', 1000);
          }
        }
      });

      // Check missed notes
      song.tiles.forEach((t) => {
        const state = tileStatesRef.current.get(t.id);
        if (state && state.status === 'pending') {
          const noteTime = calculateNoteTimeSeconds(t.beat, song.bpm);
          if (isTilePastMissThreshold(noteTime, curTime, t.durationBeats, song.bpm)) {
            state.status = 'missed';
            registerHit(t.id, 'MISS', 0);
          }
        }
      });

      // Song completion
      const songEndGrace = (song.durationSeconds || 15) + 1.0;
      if (curTime >= songEndGrace && song.tiles.length > 0) {
        setIsCompleted(true);
        audioService.stop();
        return;
      }

      animFrameIdRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isPaused, isCompleted, song, registerHit]);

  const handleTogglePause = () => {
    if (isPaused) {
      audioService.play(audioService.getCurrentTime());
      setIsPaused(false);
    } else {
      audioService.pause();
      setIsPaused(true);
    }
  };

  const handleRestart = () => {
    audioService.stop();
    if (song) {
      const states = new Map<string, ActiveTileState>();
      song.tiles.forEach((t) => {
        states.set(t.id, {
          status: 'pending',
          heldBeats: 0,
          holdProgress: 0,
        });
      });
      tileStatesRef.current = states;
      setStats({
        score: 0,
        maxScore: song.tiles.length * 1000,
        combo: 0,
        maxCombo: 0,
        perfectCount: 0,
        greatCount: 0,
        goodCount: 0,
        missCount: 0,
        totalNotes: song.tiles.length,
        accuracy: 100,
      });
      setIsPaused(false);
      setIsCompleted(false);
      audioService.play(0);
    }
  };

  const handleExitToHome = () => {
    audioService.stop();
    router.replace('/(tabs)');
  };

  const getRank = (accuracy: number) => {
    if (accuracy >= 98) return 'S+';
    if (accuracy >= 94) return 'S';
    if (accuracy >= 85) return 'A';
    if (accuracy >= 70) return 'B';
    if (accuracy >= 55) return 'C';
    return 'D';
  };

  if (!song) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading track...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: ACTIVE_THEME.board.backgroundColor }]}>
      {/* Top HUD Cluster */}
      <SafeAreaView style={styles.topHudContainer}>
        <View style={styles.topHudRow}>
          <View style={styles.hudLeft}>
            <Pressable
              style={styles.pauseBtn}
              onPress={handleTogglePause}
              accessibilityLabel="Pause game"
            >
              <Pause size={16} color="#ffffff" />
            </Pressable>
            <View>
              <Text style={styles.hudSongTitle} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={styles.hudTimeText}>
                {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}
              </Text>
            </View>
          </View>

          <View style={styles.hudRight}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>
              {stats.score.toString().padStart(6, '0')}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Judgment & Combo Badges */}
      <HitJudgmentBadge judgment={currentJudgment} timeDiffMs={judgmentTimeDiff} />
      <ComboDisplay combo={stats.combo} />

      {/* 4-Lane Game Board */}
      <GameBoardBackground
        hitLineY={hitLineY}
        activeLanes={activeLanes}
        laneFlashes={laneFlashes}
        onLanePressStart={handleLanePressStart}
        onLanePressEnd={handleLanePressEnd}
        showKeyLabels={true}
      >
        {song.tiles.map((tile) => {
          const state = tileStatesRef.current.get(tile.id) || {
            status: 'pending',
            heldBeats: 0,
            holdProgress: 0,
          };

          const noteTimeSeconds = calculateNoteTimeSeconds(tile.beat, song.bpm);
          // Audio-Synced Game Loop formula
          const tileBottomY = calculateTileY(
            noteTimeSeconds,
            audioCurrentTime,
            pixelsPerBeat,
            song.bpm,
            hitLineY
          );

          const defaultTapHeight = geometry.defaultTapTileHeightPx;
          const tileHeight = calculateTileHeight(
            tile.durationBeats,
            pixelsPerBeat,
            defaultTapHeight
          );
          const tileTopY = tileBottomY - tileHeight;

          if (tileTopY > windowHeight + 150 || tileBottomY < -200) {
            return null;
          }

          const lanePercent = 25;
          const leftPercent = tile.lane * lanePercent;

          if (tile.durationBeats > 0) {
            return (
              <View
                key={tile.id}
                style={[
                  styles.tileWrapper,
                  { left: `${leftPercent}%`, width: `${lanePercent}%` },
                ]}
              >
                <HoldTileView
                  y={tileTopY}
                  height={tileHeight}
                  lane={tile.lane}
                  isHolding={state.status === 'holding'}
                  holdProgress={state.holdProgress}
                  isHit={state.status === 'hit'}
                  isMissed={state.status === 'missed'}
                />
              </View>
            );
          }

          return (
            <View
              key={tile.id}
              style={[
                styles.tileWrapper,
                { left: `${leftPercent}%`, width: `${lanePercent}%` },
              ]}
            >
              <TapTileView
                y={tileTopY}
                height={tileHeight}
                lane={tile.lane}
                isHit={state.status === 'hit'}
                isMissed={state.status === 'missed'}
              />
            </View>
          );
        })}
      </GameBoardBackground>

      {/* Bottom Progress Bar */}
      <View style={styles.bottomProgressBar}>
        <View
          style={[
            styles.bottomProgressFill,
            {
              width: `${Math.min(100, (audioCurrentTime / (audioDuration || 1)) * 100)}%`,
            },
          ]}
        />
      </View>

      {/* Pause Modal */}
      <Modal visible={isPaused} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.statusModalCard}>
            <Text style={styles.statusModalTitle}>Game Paused</Text>
            <Text style={styles.statusModalSub}>{song.title}</Text>

            <View style={styles.statusModalButtons}>
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={handleTogglePause}
                accessibilityLabel="Resume playing"
              >
                <Play size={15} color="#ffffff" fill="#ffffff" />
                <Text style={styles.modalPrimaryBtnText}>Resume</Text>
              </Pressable>

              <Pressable
                style={styles.modalSecondaryBtn}
                onPress={handleRestart}
                accessibilityLabel="Restart song"
              >
                <RotateCcw size={14} color="#e2e8f0" />
                <Text style={styles.modalSecondaryBtnText}>Restart</Text>
              </Pressable>

              <Pressable
                style={styles.modalTertiaryBtn}
                onPress={handleExitToHome}
                accessibilityLabel="Exit to Song List"
              >
                <Home size={14} color="#94a3b8" />
                <Text style={styles.modalTertiaryBtnText}>Exit to Song List</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Completion Overlay Modal */}
      <Modal visible={isCompleted} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.statusModalCard}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{getRank(stats.accuracy)}</Text>
            </View>

            <Text style={styles.statusModalTitle}>Song Completed!</Text>
            <Text style={styles.statusModalSub}>{song.title}</Text>

            <View style={styles.statsHeroGrid}>
              <View style={styles.statHeroBox}>
                <Text style={styles.statHeroLabel}>TOTAL SCORE</Text>
                <Text style={styles.statHeroScore}>{stats.score}</Text>
              </View>
              <View style={styles.statHeroBox}>
                <Text style={styles.statHeroLabel}>ACCURACY</Text>
                <Text style={styles.statHeroAccuracy}>{stats.accuracy}%</Text>
              </View>
            </View>

            <View style={styles.judgmentsBreakdownGrid}>
              <View style={styles.breakdownItem}>
                <Text style={styles.perfectLabel}>PERFECT</Text>
                <Text style={styles.breakdownCount}>{stats.perfectCount}</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.greatLabel}>GREAT</Text>
                <Text style={styles.breakdownCount}>{stats.greatCount}</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.goodLabel}>GOOD</Text>
                <Text style={styles.breakdownCount}>{stats.goodCount}</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.missLabel}>MISS</Text>
                <Text style={styles.breakdownCount}>{stats.missCount}</Text>
              </View>
            </View>

            <View style={styles.statusModalButtons}>
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={handleRestart}
                accessibilityLabel="Play Again"
              >
                <RotateCcw size={14} color="#ffffff" />
                <Text style={styles.modalPrimaryBtnText}>Play Again</Text>
              </Pressable>

              <Pressable
                style={styles.modalSecondaryBtn}
                onPress={handleExitToHome}
                accessibilityLabel="Back to Home"
              >
                <Home size={14} color="#e2e8f0" />
                <Text style={styles.modalSecondaryBtnText}>Back to Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  topHudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  topHudRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  hudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pauseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudSongTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    maxWidth: 130,
  },
  hudTimeText: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  hudRight: {
    alignItems: 'flex-end',
  },
  scoreLabel: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  scoreValue: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  tileWrapper: {
    position: 'absolute',
  },
  bottomProgressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#0f172a',
  },
  bottomProgressFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  statusModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    alignItems: 'center',
  },
  statusModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  statusModalSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  statusModalButtons: {
    width: '100%',
    gap: 10,
    marginTop: 20,
  },
  modalPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 14,
  },
  modalPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 14,
  },
  modalSecondaryBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  modalTertiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  modalTertiaryBtnText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  rankBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  rankText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#000000',
  },
  statsHeroGrid: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 12,
    marginVertical: 14,
  },
  statHeroBox: {
    flex: 1,
    alignItems: 'center',
  },
  statHeroLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  statHeroScore: {
    color: '#38bdf8',
    fontSize: 18,
    fontFamily: 'monospace',
    fontWeight: '900',
    marginTop: 2,
  },
  statHeroAccuracy: {
    color: '#34d399',
    fontSize: 18,
    fontFamily: 'monospace',
    fontWeight: '900',
    marginTop: 2,
  },
  judgmentsBreakdownGrid: {
    flexDirection: 'row',
    width: '100%',
    gap: 6,
    marginBottom: 14,
  },
  breakdownItem: {
    flex: 1,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    padding: 6,
    alignItems: 'center',
  },
  perfectLabel: {
    color: '#38bdf8',
    fontSize: 8,
    fontWeight: 'bold',
  },
  greatLabel: {
    color: '#34d399',
    fontSize: 8,
    fontWeight: 'bold',
  },
  goodLabel: {
    color: '#fbbf24',
    fontSize: 8,
    fontWeight: 'bold',
  },
  missLabel: {
    color: '#f87171',
    fontSize: 8,
    fontWeight: 'bold',
  },
  breakdownCount: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
