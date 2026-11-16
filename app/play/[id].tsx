import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  AppState,
  type LayoutChangeEvent,
} from 'react-native';
import { useScreenInsets } from '../../src/components/ui/useScreenInsets';
import Animated, {
  FadeIn,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Song, type SlidePoint } from '../../types/song';
import { HitJudgment, GameStats, ActiveTileState } from '../../types/game';
import { ACTIVE_THEME } from '../../constants/theme';
import {
  calculateNoteTimeSeconds,
  evaluateHitJudgment,
  isWithinHitWindow,
  calculateHoldProgress,
  isSlideTile,
  slideRange,
  calculateOverallAccuracy,
  formatAudioTime,
} from '../../src/game/engine';
import { audioService } from '../../services/audio';
import { storageService } from '../../services/storage';
import { GameBoardBackground } from '../../src/components/game/GameBoardBackground';
import { HitJudgmentBadge } from '../../src/components/game/HitJudgmentBadge';
import { ComboDisplay } from '../../src/components/game/ComboDisplay';
import { TileField, type TimedTile } from '../../src/components/game/TileField';
import { useHitFlash } from '../../src/components/game/HitEffects';
import { AnimatedBackground, isBackgroundId } from '../../src/components/backgrounds/AnimatedBackground';
import { useDefaultBackground } from '../../src/services/settings';
import { Countdown, LoadingOverlay } from '../../src/components/game/StartSequence';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { PixelIcon } from '../../src/components/ui/PixelIcon';
import { backdropIn, backdropOut, cardIn, cardOut } from '../../src/components/ui/motion';
import { FONTS } from '../../src/theme/pixel';

export default function PlayScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // loading → countdown → playing. Input and the game loop only run while playing.
  const [phase, setPhase] = useState<'loading' | 'countdown' | 'playing'>('loading');
  // Incremented on every judgment so the badge re-pops each hit
  const [hitId, setHitId] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(15);

  // Performance: the song clock lives in a shared value that the UI thread
  // reads to scroll the tiles, so nothing re-renders per frame. React state is
  // only updated at low frequency (HUD clock once per second, the visible tile
  // window twice per second) or when a tile's status changes.
  const songTime = useSharedValue(0);
  // Clock anchor mirrored from the audio engine; the UI thread extrapolates it
  // One object so the UI thread never sees a half-updated anchor (no 1-frame jumps)
  const clockAnchor = useSharedValue({ pos: 0, wallMs: 0, running: false, duration: 15 });
  const [displaySecond, setDisplaySecond] = useState<number>(0);
  const [windowStep, setWindowStep] = useState<number>(0);
  const [tileVersion, setTileVersion] = useState<number>(0);
  const bumpTiles = useCallback(() => setTileVersion((v) => v + 1), []);
  const nextMissIndexRef = useRef(0);


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
  // Background flash on every hit (UI thread)
  const { flash: hitFlash, triggerFlash } = useHitFlash();
  const activeHoldByLaneRef = useRef<Map<number, string>>(new Map());
  // Slides being followed: tile id → when the finger left the path (null = on it)
  const activeSlidesRef = useRef<Map<string, { offSince: number | null }>>(new Map());
  // Every finger's horizontal position on the board, in lanes (0 … 4)
  const fingersRef = useRef<number[]>([]);
  // Last beat seen for each held note (for the per-beat pulse while holding)
  const holdBeatRef = useRef<Map<string, number>>(new Map());
  const animFrameIdRef = useRef<number | null>(null);

  const insets = useScreenInsets();
  const defaultBackground = useDefaultBackground();
  // Measured height of the play area (the real screen size once system bars are hidden)
  const [boardHeight, setBoardHeight] = useState<number>(0);
  const { geometry } = ACTIVE_THEME;
  const pixelsPerBeat = geometry.pixelsPerBeat;
  const hitLineY = Math.round(boardHeight * (geometry.hitLineYPercent / 100));

  const handleRootLayout = (e: LayoutChangeEvent) => {
    setBoardHeight(e.nativeEvent.layout.height);
  };

  // Pre-computed timing data (sorted by start time) so per-frame and per-tap
  // work doesn't repeatedly filter / sort / recompute the beatmap.
  const timeline = useMemo<TimedTile[]>(() => {
    if (!song) return [];
    return song.tiles
      .map((t) => {
        const noteTime = calculateNoteTimeSeconds(t.beat, song.bpm);
        const durationSeconds = (t.durationBeats * 60) / song.bpm;
        return { ...t, noteTime, durationSeconds, endTime: noteTime + durationSeconds };
      })
      .sort((a, b) => a.noteTime - b.noteTime);
  }, [song]);

  const tilesById = useMemo(() => new Map(timeline.map((t) => [t.id, t])), [timeline]);

  const tilesByLane = useMemo(() => {
    const lanes: TimedTile[][] = [[], [], [], []];
    timeline.forEach((t) => {
      lanes[t.lane].push(t);
      // A slide starting between two lanes can be pressed from either one
      const x0 = isSlideTile(t) ? t.path![0].x : t.lane;
      const right = Math.ceil(x0 - 1e-6);
      if (right !== t.lane && right >= 0 && right <= 3) lanes[right].push(t);
    });
    return lanes;
  }, [timeline]);

  // Mirror the audio clock anchor into shared values (only changes on
  // start / pause / drift correction — a few times per song, not per frame).
  useEffect(
    () =>
      audioService.subscribeClock((anchor) => {
        clockAnchor.value = { pos: anchor.pos, wallMs: anchor.wallMs, running: anchor.running, duration: anchor.duration };
      }),
    [clockAnchor]
  );

  // Advance the song clock on the UI thread every display frame. Tile motion
  // reads this directly, so it stays smooth regardless of JS-thread load.
  useFrameCallback(() => {
    const a = clockAnchor.value;
    songTime.value = a.running
      ? Math.min(a.duration, a.pos + (Date.now() - a.wallMs) / 1000)
      : a.pos;
  });

  // Only tiles near the playhead are mounted; the window advances every 0.5s
  /**
 * Is a finger (lanes, 0–4) on the slide around beat `at` of its path? Looks a
 * little ahead and behind, so steep and sideways parts are easy to follow.
 */
const fingerFollowsSlide = (finger: number, path: SlidePoint[], at: number) => {
  const { min, max } = slideRange(path, at - 0.25, at + 0.25);
  return finger >= min - 0.35 && finger <= max + 1.35;
};

const SLIDE_GRACE_SEC = 0.3; // how long a finger may slip off a slide before it ends
  const WINDOW_STEP_SEC = 0.5;
  const visibleTiles = useMemo(() => {
    if (!song || boardHeight === 0) return [];
    const speed = (pixelsPerBeat * song.bpm) / 60;
    const t = windowStep * WINDOW_STEP_SEC;
    const lookahead = hitLineY / speed + WINDOW_STEP_SEC + 1;
    const behind = (boardHeight - hitLineY) / speed + WINDOW_STEP_SEC + 0.5;
    return timeline.filter((tile) => tile.endTime >= t - behind && tile.noteTime <= t + lookahead);
  }, [song, boardHeight, hitLineY, pixelsPerBeat, timeline, windowStep]);

  const getTileState = useCallback((tileId: string) => tileStatesRef.current.get(tileId), []);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, (songTime.value / (audioDuration || 1)) * 100)}%`,
  }));

  // Load song from storage
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const target = await storageService.getSongById(id || '');
      if (cancelled) return;
      if (!target) {
        setLoadError('Song not found.');
        return;
      }
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

      // Load the audio, keeping the loading screen up for a minimum time so it
      // doesn't flash, then hand over to the countdown (which starts playback).
      const uri = await storageService.getAudioUriForSong(target);
      await Promise.all([
        audioService.loadTrack(target.id, uri, target.bpm, target.durationSeconds),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
      if (cancelled) return;
      setAudioDuration(audioService.getDuration());
      setPhase('countdown');
    }
    init().catch((err) => {
      console.warn('Failed to start song:', err);
      if (!cancelled) setLoadError('Could not load this song\'s audio.');
    });

    return () => {
      cancelled = true;
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
      setHitId((n) => n + 1);

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

  const handleLanePressStart = useCallback(
    (lane: 0 | 1 | 2 | 3) => {
      if (phase !== 'playing' || isPaused || isCompleted || !song) return;

      const curAudioTime = audioService.getCurrentTime();

      // A finger sliding along a slide into the next lane isn't a new tap
      for (const [slideId] of activeSlidesRef.current) {
        const slide = tilesById.get(slideId);
        const st = tileStatesRef.current.get(slideId);
        if (!slide || !st || !slide.path) continue;
        const p = calculateHoldProgress(curAudioTime, st.holdStartTime ?? slide.noteTime, slide.durationSeconds);
        if (fingerFollowsSlide(lane + 0.5, slide.path, p * slide.durationBeats)) return;
      }

      // Free tapping (like the classic game): any tile that's on screen can be
      // tapped — the lowest unplayed one in the lane is hit, wherever it is.
      const speed = (pixelsPerBeat * song.bpm) / 60;
      const enterLead = hitLineY / speed; // seconds before noteTime that the tile appears at the top
      let targetTile: TimedTile | null = null;
      for (const t of tilesByLane[lane]) {
        if (t.noteTime - curAudioTime > enterLead) break; // sorted: the rest aren't on screen yet
        const state = tileStatesRef.current.get(t.id);
        if (state && state.status === 'pending') {
          targetTile = t; // earliest pending tile = lowest on screen
          break;
        }
      }

      if (targetTile) {
        const timeDiffSec = curAudioTime - targetTile.noteTime;
        // Taps near the line keep their timing grade; earlier taps still count as a hit
        const result = isWithinHitWindow(timeDiffSec)
          ? evaluateHitJudgment(timeDiffSec)
          : { judgment: 'GREAT' as HitJudgment, score: 750 };

        if (targetTile.durationBeats === 0) {
          tileStatesRef.current.set(targetTile.id, {
            status: 'hit',
            heldBeats: 0,
            holdProgress: 1,
          });
          registerHit(
            targetTile.id,
            result.judgment,
            result.score,
            isWithinHitWindow(timeDiffSec) ? Math.round(timeDiffSec * 1000) : undefined
          );
          triggerFlash(result.judgment);
        } else {
          tileStatesRef.current.set(targetTile.id, {
            status: 'holding',
            heldBeats: 0,
            holdProgress: 0,
            holdStartTime: curAudioTime,
          });
          // Slides are followed by finger position (not lane), so a finger can move across lanes
          if (isSlideTile(targetTile)) activeSlidesRef.current.set(targetTile.id, { offSince: null });
          else activeHoldByLaneRef.current.set(lane, targetTile.id);
          triggerFlash(result.judgment);
        }
        bumpTiles();
      }
    },
    [phase, isPaused, isCompleted, song, registerHit, tilesByLane, tilesById, bumpTiles, pixelsPerBeat, hitLineY]
  );

  const handleFingersChange = useCallback((fingers: number[]) => {
    fingersRef.current = fingers;
  }, []);

  const handleLanePressEnd = useCallback(
    (lane: 0 | 1 | 2 | 3) => {
      const holdingTileId = activeHoldByLaneRef.current.get(lane);
      if (holdingTileId && song) {
        activeHoldByLaneRef.current.delete(lane);
        const tile = tilesById.get(holdingTileId);
        const state = tileStatesRef.current.get(holdingTileId);

        if (tile && state && state.status === 'holding') {
          const curTime = audioService.getCurrentTime();
          // Progress counts from the moment the hold was pressed
          const progress = calculateHoldProgress(curTime, state.holdStartTime ?? tile.noteTime, tile.durationSeconds);

          if (progress >= 0.85) {
            state.status = 'hit';
            state.holdProgress = 1;
            registerHit(tile.id, 'PERFECT', 1000);
            triggerFlash('PERFECT');
          } else {
            state.status = 'missed';
            state.holdProgress = progress;
            registerHit(tile.id, 'MISS', 0);
            triggerFlash('MISS');
          }
          bumpTiles();
        }
      }
    },
    [song, registerHit, tilesById, bumpTiles]
  );

  // Audio-Synced Game Loop
  useEffect(() => {
    if (phase !== 'playing' || isPaused || isCompleted || !song) return;

    let lastSecond = -1;
    let lastStep = -1;

    const gameLoop = () => {
      const curTime = audioService.getCurrentTime();

      // Low-frequency React updates only
      const second = Math.floor(curTime);
      if (second !== lastSecond) {
        lastSecond = second;
        setDisplaySecond(second);
      }
      const step = Math.floor(curTime / WINDOW_STEP_SEC);
      if (step !== lastStep) {
        lastStep = step;
        setWindowStep(step);
      }

      let tilesChanged = false;

      // Check active hold notes
      activeHoldByLaneRef.current.forEach((tileId, lane) => {
        const tile = tilesById.get(tileId);
        const state = tileStatesRef.current.get(tileId);
        if (tile && state && state.status === 'holding') {
          const progress = calculateHoldProgress(curTime, state.holdStartTime ?? tile.noteTime, tile.durationSeconds);
          state.holdProgress = progress;

          // A small background pulse on every beat you keep holding
          const beat = Math.floor((curTime * song.bpm) / 60);
          if (beat > (holdBeatRef.current.get(tileId) ?? Infinity)) triggerFlash(0.35);
          holdBeatRef.current.set(tileId, beat);

          if (progress >= 1.0) {
            state.status = 'hit';
            activeHoldByLaneRef.current.delete(lane);
            registerHit(tile.id, 'PERFECT', 1000);
            triggerFlash('PERFECT');
            tilesChanged = true;
          }
        }
      });

      // Slides: keep a finger on the path. Briefly slipping off is forgiven;
      // staying off ends the slide (a hit if it was mostly done).
      activeSlidesRef.current.forEach((track, tileId) => {
        const tile = tilesById.get(tileId);
        const state = tileStatesRef.current.get(tileId);
        if (!tile || !tile.path || !state || state.status !== 'holding') {
          activeSlidesRef.current.delete(tileId);
          return;
        }
        const progress = calculateHoldProgress(curTime, state.holdStartTime ?? tile.noteTime, tile.durationSeconds);
        state.holdProgress = progress;
        const at = progress * tile.durationBeats;
        const onPath = fingersRef.current.some((f) => fingerFollowsSlide(f, tile.path!, at));
        track.offSince = onPath ? null : (track.offSince ?? curTime);

        const beat = Math.floor((curTime * song.bpm) / 60);
        if (onPath && beat > (holdBeatRef.current.get(tileId) ?? Infinity)) triggerFlash(0.35);
        holdBeatRef.current.set(tileId, beat);

        const slippedOff = track.offSince !== null && curTime - track.offSince > SLIDE_GRACE_SEC;
        if (progress >= 1 || slippedOff) {
          activeSlidesRef.current.delete(tileId);
          const success = progress >= 0.85;
          state.status = success ? 'hit' : 'missed';
          if (success) state.holdProgress = 1;
          registerHit(tile.id, success ? 'PERFECT' : 'MISS', success ? 1000 : 0);
          triggerFlash(success ? 'PERFECT' : 'MISS');
          tilesChanged = true;
        }
      });

      // Check missed notes. Tiles are sorted by start time; a pointer skips the
      // leading run of already-resolved tiles so we never rescan the whole map.
      // A tile is only missed once it reaches the bottom of the screen (it then
      // turns red as it slides out), not when it passes the hit line.
      const offScreenDelay = Math.max(0.2, (boardHeight - hitLineY) / ((pixelsPerBeat * song.bpm) / 60));
      let advancing = true;
      for (let j = nextMissIndexRef.current; j < timeline.length; j++) {
        const t = timeline[j];
        if (t.noteTime > curTime) break; // the rest haven't started yet
        const state = tileStatesRef.current.get(t.id);
        if (state?.status === 'pending' && curTime > t.noteTime + offScreenDelay) {
          state.status = 'missed';
          registerHit(t.id, 'MISS', 0);
          triggerFlash('MISS');
          tilesChanged = true;
        }
        const resolved = state?.status === 'hit' || state?.status === 'missed';
        if (advancing && resolved) nextMissIndexRef.current = j + 1;
        else advancing = false;
      }

      if (tilesChanged) bumpTiles();

      // Song completion: the track finished, or we're past its end
      const songEnded =
        curTime >= audioService.getDuration() + 1.0 ||
        (!audioService.getIsPlaying() && curTime > 0);
      if (songEnded && song.tiles.length > 0) {
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
  }, [phase, isPaused, isCompleted, song, registerHit, timeline, tilesById, bumpTiles, boardHeight, hitLineY, pixelsPerBeat]);

  const handleTogglePause = () => {
    if (isPaused) {
      audioService.play(audioService.getCurrentTime());
      setIsPaused(false);
    } else {
      audioService.pause();
      setIsPaused(true);
    }
  };

  // Auto-pause when the app is sent to the background (home button, call, etc.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && audioService.getIsPlaying()) {
        audioService.pause();
        setIsPaused(true);
      }
    });
    return () => sub.remove();
  }, []);

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
      songTime.value = 0;
      nextMissIndexRef.current = 0;
      activeHoldByLaneRef.current.clear();
      activeSlidesRef.current.clear();
      holdBeatRef.current.clear();
      setDisplaySecond(0);
      setWindowStep(0);
      bumpTiles();
      setCurrentJudgment(null);
      setPhase('countdown');
    }
  };

  const handleExitToHome = () => {
    audioService.stop();
    // Close the game screen to reveal the existing Songs tab (replace() rebuilt the
    // tabs behind the fade, which showed as a flash)
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const getRank = (accuracy: number) => {
    if (accuracy >= 98) return 'S+';
    if (accuracy >= 94) return 'S';
    if (accuracy >= 85) return 'A';
    if (accuracy >= 70) return 'B';
    if (accuracy >= 55) return 'C';
    return 'D';
  };

  const handleCountdownDone = () => {
    audioService.play(0);
    setPhase('playing');
  };

  if (loadError) {
    return (
      <Animated.View entering={FadeIn} style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{loadError}</Text>
        <PressableScale style={[styles.modalSecondaryBtn, styles.errorBackBtn]} onPress={handleExitToHome}>
          <PixelIcon name="home" size={18} color="#e6ecf7" />
          <Text style={styles.modalSecondaryBtnText}>Back to Home</Text>
        </PressableScale>
      </Animated.View>
    );
  }

  if (!song) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingOverlay />
      </View>
    );
  }

  return (
    <View
      style={[styles.root, { backgroundColor: ACTIVE_THEME.board.backgroundColor }]}
      onLayout={handleRootLayout}
    >
      {/* Top HUD Cluster */}
      <Animated.View
        entering={FadeInUp.delay(150).duration(400)}
        style={[
          styles.topHudContainer,
          { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
        ]}
      >
        <View style={styles.topHudRow}>
          <View style={styles.hudLeft}>
            <PressableScale
              style={[styles.pauseBtn, phase !== 'playing' && styles.pauseBtnDisabled]}
              onPress={handleTogglePause}
              disabled={phase !== 'playing'}
              scaleTo={0.88}
              accessibilityLabel="Pause game"
            >
              <PixelIcon name="pause" size={14} color="#ffffff" />
            </PressableScale>
            <View>
              <Text style={styles.hudSongTitle} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={styles.hudTimeText}>
                {formatAudioTime(displaySecond)} / {formatAudioTime(audioDuration)}
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
      </Animated.View>

      {/* Judgment & Combo Badges */}
      <HitJudgmentBadge judgment={currentJudgment} timeDiffMs={judgmentTimeDiff} hitId={hitId} />
      <ComboDisplay combo={stats.combo} />

      {/* 4-Lane Game Board */}
      <GameBoardBackground
        hitLineY={hitLineY}
        onLanePressStart={handleLanePressStart}
        onLanePressEnd={handleLanePressEnd}
        onFingersChange={handleFingersChange}
        backdrop={
          <>
            <AnimatedBackground
              id={isBackgroundId(song.background) ? song.background : defaultBackground}
              bpm={song.bpm}
              songTime={songTime}
              flash={hitFlash}
              opacity={0.5}
            />
          </>
        }
      >
        {boardHeight > 0 && (
          <TileField
            tiles={visibleTiles}
            bpm={song.bpm}
            hitLineY={hitLineY}
            pixelsPerBeat={pixelsPerBeat}
            tapHeight={geometry.defaultTapTileHeightPx}
            songTime={songTime}
            getTileState={getTileState}
            version={tileVersion}
          />
        )}
      </GameBoardBackground>

      {/* Bottom Progress Bar */}
      <View style={styles.bottomProgressBar}>
        <Animated.View style={[styles.bottomProgressFill, progressStyle]} />
      </View>

      {/* Pause Overlay (in-screen instead of <Modal>, which re-shows the Android system bars) */}
      {isPaused && (
        <Animated.View entering={backdropIn} exiting={backdropOut} style={styles.modalBackdrop}>
          <Animated.View entering={cardIn} exiting={cardOut} style={styles.statusModalCard}>
            <Text style={styles.statusModalTitle}>Game Paused</Text>
            <Text style={styles.statusModalSub}>{song.title}</Text>

            <View style={styles.statusModalButtons}>
              <PressableScale
                style={styles.modalPrimaryBtn}
                onPress={handleTogglePause}
                accessibilityLabel="Resume playing"
              >
                <PixelIcon name="play" size={14} color="#ffffff" />
                <Text style={styles.modalPrimaryBtnText}>Resume</Text>
              </PressableScale>

              <PressableScale
                style={styles.modalSecondaryBtn}
                onPress={handleRestart}
                accessibilityLabel="Restart song"
              >
                <PixelIcon name="reset" size={14} color="#e6ecf7" />
                <Text style={styles.modalSecondaryBtnText}>Restart</Text>
              </PressableScale>

              <PressableScale
                style={styles.modalTertiaryBtn}
                onPress={handleExitToHome}
                accessibilityLabel="Exit to Song List"
              >
                <PixelIcon name="home" size={18} color="#9aa7c2" />
                <Text style={styles.modalTertiaryBtnText}>Exit to Song List</Text>
              </PressableScale>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Completion Overlay */}
      {isCompleted && (
        <Animated.View entering={backdropIn} exiting={backdropOut} style={styles.modalBackdrop}>
          <Animated.View entering={cardIn} exiting={cardOut} style={styles.statusModalCard}>
            <Animated.View entering={ZoomIn.delay(200).springify().damping(10)} style={styles.rankBadge}>
              <Text style={styles.rankText}>{getRank(stats.accuracy)}</Text>
            </Animated.View>

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
              <PressableScale
                style={styles.modalPrimaryBtn}
                onPress={handleRestart}
                accessibilityLabel="Play Again"
              >
                <PixelIcon name="reset" size={14} color="#ffffff" />
                <Text style={styles.modalPrimaryBtnText}>Play Again</Text>
              </PressableScale>

              <PressableScale
                style={styles.modalSecondaryBtn}
                onPress={handleExitToHome}
                accessibilityLabel="Back to Home"
              >
                <PixelIcon name="home" size={18} color="#e6ecf7" />
                <Text style={styles.modalSecondaryBtnText}>Back to Home</Text>
              </PressableScale>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Start sequence: countdown over the board, then music starts */}
      {phase === 'countdown' && !isPaused && <Countdown onDone={handleCountdownDone} />}

      {/* Loading screen fades out once the audio is ready */}
      {phase === 'loading' && (
        <LoadingOverlay title={song.title} subtitle={`${song.bpm} BPM · ${song.tiles.length} notes`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#05070d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 20,
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
  pauseBtnDisabled: {
    opacity: 0.4,
  },
  pauseBtn: {
    width: 36,
    height: 36,
    borderRadius: 0,
    backgroundColor: 'rgba(11, 18, 32, 0.85)',
    borderWidth: 2,
    borderColor: 'rgba(31, 46, 82, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudSongTitle: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
    maxWidth: 130,
  },
  hudTimeText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 15,
  },
  hudRight: {
    alignItems: 'flex-end',
  },
  scoreLabel: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 15,
    letterSpacing: 1.5,
  },
  scoreValue: {
    color: '#ffffff',
    fontFamily: FONTS.pixel,
    fontSize: 13,
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
    backgroundColor: '#0b1220',
  },
  bottomProgressFill: {
    height: '100%',
    backgroundColor: '#4d8dff',
  },
  errorBackBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  statusModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0b1220',
    borderRadius: 0,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    alignItems: 'center',
  },
  statusModalTitle: {
    fontFamily: FONTS.pixel,
    fontSize: 14,
    color: '#ffffff',
    letterSpacing: 0,
  },
  statusModalSub: {
    fontFamily: FONTS.body,
    fontSize: 17,
    color: '#9aa7c2',
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
    backgroundColor: '#FF6B4A',
    paddingVertical: 12,
    borderRadius: 0,
  },
  modalPrimaryBtnText: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 19,
  },
  modalSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15203a',
    paddingVertical: 10,
    borderRadius: 0,
  },
  modalSecondaryBtnText: {
    color: '#cdd6ea',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  modalTertiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  modalTertiaryBtnText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  rankBadge: {
    width: 60,
    height: 60,
    borderRadius: 0,
    backgroundColor: '#FF6B4A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  rankText: {
    fontFamily: FONTS.pixel,
    fontSize: 18,
    color: '#000000',
  },
  statsHeroGrid: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    backgroundColor: 'rgba(7, 11, 20, 0.7)',
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#15203a',
    padding: 12,
    marginVertical: 14,
  },
  statHeroBox: {
    flex: 1,
    alignItems: 'center',
  },
  statHeroLabel: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: '#9aa7c2',
    letterSpacing: 1,
  },
  statHeroScore: {
    color: '#4d8dff',
    fontFamily: FONTS.pixel,
    fontSize: 13,
    marginTop: 2,
  },
  statHeroAccuracy: {
    color: '#4d8dff',
    fontFamily: FONTS.pixel,
    fontSize: 13,
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
    backgroundColor: '#070b14',
    borderWidth: 2,
    borderColor: '#15203a',
    borderRadius: 0,
    padding: 6,
    alignItems: 'center',
  },
  perfectLabel: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 12,
  },
  greatLabel: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 12,
  },
  goodLabel: {
    color: '#FF6B4A',
    fontFamily: FONTS.body,
    fontSize: 12,
  },
  missLabel: {
    color: '#FF6B4A',
    fontFamily: FONTS.body,
    fontSize: 12,
  },
  breakdownCount: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
    marginTop: 2,
  },
});
