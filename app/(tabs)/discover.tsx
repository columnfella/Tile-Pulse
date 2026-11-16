import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PixelIcon, type PixelIconName } from '../../src/components/ui/PixelIcon';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { listItemIn } from '../../src/components/ui/motion';
import { storageService } from '../../services/storage';
import { formatAudioTime } from '../../game/engine';
import {
  API_BASE,
  ApiUnavailableError,
  downloadLevel,
  localIdForLevel,
  searchLevels,
  type CommunityLevel,
  type Difficulty,
  type LevelFilters,
  type LevelSort,
  type NoteFilter,
  type SearchField,
} from '../../src/services/communityApi';
import { FONTS, PIXEL } from '../../src/theme/pixel';

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

/* ------------------------------ filter options ----------------------------- */

const SEARCH_FIELDS: { key: SearchField; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'level', label: 'Level' },
  { key: 'song', label: 'Song' },
  { key: 'artist', label: 'Artist' },
  { key: 'author', label: 'Mapper' },
];

const SORTS: { key: LevelSort; label: string; icon?: PixelIconName }[] = [
  { key: 'newest', label: 'New', icon: 'clock' },
  { key: 'popular', label: 'Popular', icon: 'star' },
  { key: 'easiest', label: 'Easiest' },
  { key: 'hardest', label: 'Hardest' },
  { key: 'shortest', label: 'Shortest' },
  { key: 'longest', label: 'Longest' },
  { key: 'title', label: 'A–Z' },
];

const DIFFICULTIES: { key: Difficulty; label: string; color: string }[] = [
  { key: 'easy', label: 'Easy', color: '#9cc0ff' },
  { key: 'normal', label: 'Normal', color: '#4d8dff' },
  { key: 'hard', label: 'Hard', color: '#2f6bff' },
  { key: 'expert', label: 'Expert', color: PIXEL.accent },
];
const DIFFICULTY_COLOR = Object.fromEntries(DIFFICULTIES.map((d) => [d.key, d.color])) as Record<Difficulty, string>;

type Range = { min?: number; max?: number };
const BPM_RANGES: { label: string; range: Range }[] = [
  { label: 'Any', range: {} },
  { label: '< 100', range: { max: 99.99 } },
  { label: '100–140', range: { min: 100, max: 140 } },
  { label: '140+', range: { min: 140.01 } },
];
const LENGTH_RANGES: { label: string; range: Range }[] = [
  { label: 'Any', range: {} },
  { label: '< 2 min', range: { max: 119 } },
  { label: '2–4 min', range: { min: 120, max: 240 } },
  { label: '4 min+', range: { min: 241 } },
];
const NOTE_FILTERS: { key: NoteFilter; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'taps', label: 'Taps only' },
  { key: 'holds', label: 'Has holds' },
];

interface Filters {
  difficulty: Difficulty[];
  minLevel: number;
  maxLevel: number;
  bpm: number; // index into BPM_RANGES
  length: number; // index into LENGTH_RANGES
  notes: NoteFilter;
  playableOnly: boolean; // levels with audio uploaded
}

const DEFAULT_FILTERS: Filters = {
  difficulty: [],
  minLevel: 1,
  maxLevel: 20,
  bpm: 0,
  length: 0,
  notes: 'any',
  playableOnly: true,
};

function activeFilterCount(f: Filters): number {
  return (
    (f.difficulty.length > 0 ? 1 : 0) +
    (f.minLevel !== 1 || f.maxLevel !== 20 ? 1 : 0) +
    (f.bpm !== 0 ? 1 : 0) +
    (f.length !== 0 ? 1 : 0) +
    (f.notes !== 'any' ? 1 : 0) +
    (f.playableOnly !== DEFAULT_FILTERS.playableOnly ? 1 : 0)
  );
}

const formatPlays = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

/* --------------------------------- pieces --------------------------------- */

function Chip({
  label,
  active,
  onPress,
  icon,
  color = PIXEL.accent2,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: PixelIconName;
  color?: string;
}) {
  return (
    <PressableScale
      scaleTo={0.92}
      onPress={onPress}
      style={[styles.chip, active && { borderColor: color, backgroundColor: `${color}22` }]}
      accessibilityState={{ selected: active }}
    >
      {icon ? <PixelIcon name={icon} size={7} color={active ? color : PIXEL.textDim} /> : null}
      <Text style={[styles.chipText, active && { color }]}>{label}</Text>
    </PressableScale>
  );
}

function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <View style={styles.stepper}>
      <PressableScale scaleTo={0.85} style={styles.stepBtn} disabled={value <= min} onPress={() => onChange(value - 1)}>
        <PixelIcon name="minus" size={7} color={value <= min ? '#3a4a70' : PIXEL.text} />
      </PressableScale>
      <Text style={styles.stepValue}>{value}</Text>
      <PressableScale scaleTo={0.85} style={styles.stepBtn} disabled={value >= max} onPress={() => onChange(value + 1)}>
        <PixelIcon name="plus" size={7} color={value >= max ? '#3a4a70' : PIXEL.text} />
      </PressableScale>
    </View>
  );
}

/** Square pixel badge with the level number, tinted by difficulty. */
function LevelBadge({ level, difficulty }: { level: number; difficulty: Difficulty }) {
  const color = DIFFICULTY_COLOR[difficulty];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.badgeTop, { backgroundColor: color }]}>
        <Text style={styles.badgeTopText}>{difficulty.slice(0, 3).toUpperCase()}</Text>
      </View>
      <Text style={[styles.badgeLevel, { color }]}>{level}</Text>
    </View>
  );
}

/* --------------------------------- screen --------------------------------- */

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [field, setField] = useState<SearchField>('all');
  const [sort, setSort] = useState<LevelSort>('newest');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [levels, setLevels] = useState<CommunityLevel[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; error?: boolean } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Which levels are already in the local library; collapse panels when leaving the tab
  useFocusEffect(
    useCallback(() => {
      storageService
        .getSongs()
        .then((songs) => setDownloaded(new Set(songs.map((s) => s.id))))
        .catch(() => {});
      return () => {
        setFiltersOpen(false);
        setExpandedId(null);
      };
    }, [])
  );

  const apiFilters = useMemo<LevelFilters>(() => {
    const bpm = BPM_RANGES[filters.bpm].range;
    const len = LENGTH_RANGES[filters.length].range;
    return {
      q: query.trim() || undefined,
      in: field,
      sort,
      difficulty: filters.difficulty,
      minLevel: filters.minLevel !== 1 ? filters.minLevel : undefined,
      maxLevel: filters.maxLevel !== 20 ? filters.maxLevel : undefined,
      minBpm: bpm.min,
      maxBpm: bpm.max,
      minDurationSec: len.min,
      maxDurationSec: len.max,
      notes: filters.notes,
      hasAudio: filters.playableOnly ? true : undefined,
      limit: PAGE_SIZE,
    };
  }, [query, field, sort, filters]);

  // First page whenever the search or filters change (debounced for typing)
  useEffect(() => {
    const controller = new AbortController();
    setLoad((s) => (s.status === 'idle' && levels.length > 0 ? s : { status: 'loading' }));
    const timer = setTimeout(() => {
      searchLevels(apiFilters, controller.signal)
        .then((r) => {
          if (controller.signal.aborted) return;
          setLevels(r.levels);
          setNextOffset(r.nextOffset);
          setExpandedId(null);
          setLoad({ status: 'idle' });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setLevels([]);
          setNextOffset(null);
          setLoad(
            err instanceof ApiUnavailableError
              ? { status: 'offline' }
              : { status: 'error', message: err instanceof Error ? err.message : 'Search failed.' }
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setRefreshing(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFilters, reloadKey]);

  const handleLoadMore = () => {
    if (nextOffset === null || loadingMore || load.status !== 'idle') return;
    setLoadingMore(true);
    searchLevels({ ...apiFilters, offset: nextOffset })
      .then((r) => {
        setLevels((prev) => [...prev, ...r.levels.filter((l) => !prev.some((p) => p.id === l.id))]);
        setNextOffset(r.nextOffset);
      })
      .catch(() => setNextOffset(null))
      .finally(() => setLoadingMore(false));
  };

  const showBanner = (text: string, error = false) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ text, error });
    bannerTimer.current = setTimeout(() => setBanner(null), 3000);
  };

  const handleGet = async (level: CommunityLevel) => {
    if (downloading) return;
    setDownloading(level.id);
    try {
      const song = await downloadLevel(level);
      setDownloaded((prev) => new Set(prev).add(song.id));
      showBanner(`“${level.name}” added to your songs`);
    } catch (err) {
      showBanner(
        err instanceof ApiUnavailableError ? 'Server is offline — try again later.' : err instanceof Error ? err.message : 'Download failed.',
        true
      );
    } finally {
      setDownloading(null);
    }
  };

  const updateFilters = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleDifficulty = (d: Difficulty) =>
    updateFilters({
      difficulty: filters.difficulty.includes(d) ? filters.difficulty.filter((x) => x !== d) : [...filters.difficulty, d],
    });
  const filterCount = activeFilterCount(filters);

  /* ------------------------------ rendering ------------------------------ */

  const renderFilterPanel = () => (
    <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)} style={styles.filterPanel}>
      <Text style={styles.filterLabel}>DIFFICULTY</Text>
      <View style={styles.chipRow}>
        {DIFFICULTIES.map((d) => (
          <Chip
            key={d.key}
            label={d.label}
            color={d.color}
            active={filters.difficulty.includes(d.key)}
            onPress={() => toggleDifficulty(d.key)}
          />
        ))}
      </View>

      <Text style={styles.filterLabel}>LEVEL</Text>
      <View style={styles.levelRow}>
        <Stepper
          value={filters.minLevel}
          min={1}
          max={filters.maxLevel}
          onChange={(v) => updateFilters({ minLevel: v })}
        />
        <Text style={styles.levelTo}>to</Text>
        <Stepper
          value={filters.maxLevel}
          min={filters.minLevel}
          max={20}
          onChange={(v) => updateFilters({ maxLevel: v })}
        />
      </View>

      <Text style={styles.filterLabel}>TEMPO (BPM)</Text>
      <View style={styles.chipRow}>
        {BPM_RANGES.map((r, i) => (
          <Chip key={r.label} label={r.label} active={filters.bpm === i} onPress={() => updateFilters({ bpm: i })} />
        ))}
      </View>

      <Text style={styles.filterLabel}>LENGTH</Text>
      <View style={styles.chipRow}>
        {LENGTH_RANGES.map((r, i) => (
          <Chip key={r.label} label={r.label} active={filters.length === i} onPress={() => updateFilters({ length: i })} />
        ))}
      </View>

      <Text style={styles.filterLabel}>NOTES</Text>
      <View style={styles.chipRow}>
        {NOTE_FILTERS.map((n) => (
          <Chip key={n.key} label={n.label} active={filters.notes === n.key} onPress={() => updateFilters({ notes: n.key })} />
        ))}
      </View>

      <View style={styles.filterFooter}>
        <Chip
          label="Playable only"
          icon="check"
          active={filters.playableOnly}
          onPress={() => updateFilters({ playableOnly: !filters.playableOnly })}
        />
        <PressableScale
          scaleTo={0.92}
          style={styles.resetBtn}
          disabled={filterCount === 0}
          onPress={() => setFilters(DEFAULT_FILTERS)}
        >
          <PixelIcon name="reset" size={7} color={filterCount === 0 ? '#3a4a70' : PIXEL.accent} />
          <Text style={[styles.resetText, filterCount === 0 && { color: '#3a4a70' }]}>Reset</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );

  const renderLevel = ({ item, index }: { item: CommunityLevel; index: number }) => {
    const expanded = expandedId === item.id;
    const localId = localIdForLevel(item.id);
    const isDownloaded = downloaded.has(localId);
    const isDownloading = downloading === item.id;
    const seconds = item.song.durationMs ? Math.round(item.song.durationMs / 1000) : null;

    return (
      <Animated.View entering={listItemIn(index % PAGE_SIZE)}>
        <PressableScale
          scaleTo={0.98}
          style={[styles.card, expanded && styles.cardExpanded]}
          onPress={() => {
            Keyboard.dismiss();
            setExpandedId(expanded ? null : item.id);
          }}
        >
          <View style={styles.cardTop}>
            <LevelBadge level={item.level} difficulty={item.difficulty} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.cardSong} numberOfLines={1}>
                {item.song.title}
                {item.song.artist ? ` · ${item.song.artist}` : ''}
              </Text>
              <Text style={styles.cardAuthor} numberOfLines={1}>
                by {item.author.displayName}
              </Text>
            </View>
            {isDownloaded ? (
              <View style={styles.ownedTag}>
                <PixelIcon name="check" size={7} color={PIXEL.accent2} />
              </View>
            ) : null}
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.stat}>{Math.round(item.song.bpm)} BPM</Text>
            <Text style={styles.statDot}>■</Text>
            <Text style={styles.stat}>{seconds !== null ? formatAudioTime(seconds) : '--:--'}</Text>
            <Text style={styles.statDot}>■</Text>
            <Text style={styles.stat}>{item.noteCount} notes</Text>
            <View style={styles.flex} />
            <PixelIcon name="play" size={7} color="#6b7a99" />
            <Text style={styles.stat}>{formatPlays(item.plays)}</Text>
          </View>

          {expanded && (
            <Animated.View entering={FadeIn.duration(160)} style={styles.panel}>
              <View style={styles.detailRow}>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>HOLDS</Text>
                  <Text style={styles.detailValue}>{item.holdCount}</Text>
                </View>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>TIME SIG</Text>
                  <Text style={styles.detailValue}>
                    {item.song.timeSignature.beatsPerMeasure}/{item.song.timeSignature.beatUnit}
                  </Text>
                </View>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>VERSION</Text>
                  <Text style={styles.detailValue}>v{item.version}</Text>
                </View>
              </View>

              {isDownloaded ? (
                <PressableScale scaleTo={0.96} style={styles.primaryBtn} onPress={() => router.push(`/play/${localId}`)}>
                  <PixelIcon name="play" size={14} color="#000000" />
                  <Text style={styles.primaryText}>PLAY</Text>
                </PressableScale>
              ) : (
                <PressableScale
                  scaleTo={0.96}
                  style={[styles.primaryBtn, !item.song.audio && styles.primaryBtnDisabled]}
                  disabled={!item.song.audio || isDownloading}
                  onPress={() => handleGet(item)}
                >
                  {isDownloading ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <PixelIcon name="download" size={14} color="#000000" />
                  )}
                  <Text style={styles.primaryText}>
                    {!item.song.audio ? 'NO AUDIO YET' : isDownloading ? 'GETTING…' : 'GET LEVEL'}
                  </Text>
                </PressableScale>
              )}
            </Animated.View>
          )}
        </PressableScale>
      </Animated.View>
    );
  };

  const renderEmpty = () => {
    if (load.status === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={PIXEL.accent2} />
          <Text style={styles.muted}>Loading levels…</Text>
        </View>
      );
    }
    if (load.status === 'offline') {
      return (
        <View style={styles.center}>
          <View style={styles.bigIcon}>
            <PixelIcon name="globe" size={28} color={PIXEL.accent} />
          </View>
          <Text style={styles.infoTitle}>SERVER OFFLINE</Text>
          <Text style={styles.muted}>Couldn’t reach the community server at</Text>
          <Text style={styles.code}>{API_BASE}</Text>
          <PressableScale scaleTo={0.94} style={styles.retryBtn} onPress={() => setReloadKey((k) => k + 1)}>
            <PixelIcon name="reset" size={7} color={PIXEL.accent2} />
            <Text style={styles.retryText}>Retry</Text>
          </PressableScale>
        </View>
      );
    }
    if (load.status === 'error') {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>{load.message}</Text>
        </View>
      );
    }
    const hasQuery = query.trim().length > 0 || filterCount > 0;
    return (
      <View style={styles.center}>
        <View style={styles.bigIcon}>
          <PixelIcon name="discover" size={28} color={PIXEL.accent2} />
        </View>
        <Text style={styles.infoTitle}>{hasQuery ? 'NO MATCHES' : 'NO LEVELS YET'}</Text>
        <Text style={styles.muted}>
          {hasQuery ? 'Try another search or loosen the filters.' : 'Community levels will show up here once players share them.'}
        </Text>
      </View>
    );
  };

  return (
    <ScreenView style={styles.root}>
      <Animated.View entering={FadeInDown.duration(300)} style={styles.header}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>DISCOVER</Text>
            <Text style={styles.subtitle}>Community levels</Text>
          </View>
          <PressableScale
            scaleTo={0.9}
            style={[styles.filterBtn, (filtersOpen || filterCount > 0) && styles.filterBtnActive]}
            onPress={() => {
              Keyboard.dismiss();
              setFiltersOpen((o) => !o);
            }}
            accessibilityLabel="Filters"
          >
            <PixelIcon name="filter" size={14} color={filtersOpen || filterCount > 0 ? '#000000' : PIXEL.text} />
            <Text style={[styles.filterBtnText, (filtersOpen || filterCount > 0) && { color: '#000000' }]}>
              FILTERS{filterCount > 0 ? ` ${filterCount}` : ''}
            </Text>
          </PressableScale>
        </View>

        <View style={styles.searchBox}>
          <PixelIcon name="discover" size={14} color="#6b7a99" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              field === 'all' ? 'Search levels, songs, mappers…' : `Search by ${SEARCH_FIELDS.find((f) => f.key === field)!.label.toLowerCase()}…`
            }
            placeholderTextColor="#6b7a99"
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            maxLength={60}
          />
          {query.length > 0 ? (
            <PressableScale scaleTo={0.85} onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <PixelIcon name="close" size={14} color="#6b7a99" />
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.fieldRow}>
          {SEARCH_FIELDS.map((f) => (
            <PressableScale
              key={f.key}
              scaleTo={0.94}
              style={[styles.fieldBtn, field === f.key && styles.fieldBtnActive]}
              onPress={() => setField(f.key)}
            >
              <Text style={[styles.fieldText, field === f.key && styles.fieldTextActive]} numberOfLines={1}>
                {f.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
          <Text style={styles.sortLabel}>SORT</Text>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} icon={s.icon} active={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </ScrollView>

        {filtersOpen && renderFilterPanel()}
      </Animated.View>

      {banner && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          exiting={FadeOut.duration(200)}
          style={[styles.banner, banner.error && styles.bannerError]}
        >
          <PixelIcon name={banner.error ? 'close' : 'check'} size={14} color={banner.error ? PIXEL.accent : PIXEL.accent2} />
          <Text style={[styles.bannerText, banner.error && { color: PIXEL.accent }]}>{banner.text}</Text>
        </Animated.View>
      )}

      <FlatList
        data={load.status === 'idle' ? levels : []}
        keyExtractor={(l) => l.id}
        renderItem={renderLevel}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, (load.status !== 'idle' || levels.length === 0) && styles.listEmpty]}
        ListEmptyComponent={renderEmpty}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={PIXEL.accent2} /> : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setReloadKey((k) => k + 1);
            }}
            tintColor={PIXEL.accent2}
            colors={[PIXEL.accent2]}
            progressBackgroundColor={PIXEL.panel}
          />
        }
      />
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 14 },
  subtitle: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17, marginTop: 4 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: PIXEL.panelLight,
    borderWidth: 2,
    borderColor: '#000000',
  },
  filterBtnActive: { backgroundColor: PIXEL.accent },
  filterBtnText: { color: PIXEL.text, fontFamily: FONTS.pixel, fontSize: 8 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PIXEL.panel,
    borderWidth: 2,
    borderColor: '#1f2e52',
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: '#ffffff', fontFamily: FONTS.body, fontSize: 20, paddingVertical: 9 },

  fieldRow: { flexDirection: 'row', gap: 3, padding: 3, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight },
  fieldBtn: { flex: 1, alignItems: 'center', paddingVertical: 5 },
  fieldBtnActive: { backgroundColor: 'rgba(77, 141, 255, 0.18)' },
  fieldText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17 },
  fieldTextActive: { color: PIXEL.accent2 },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  sortLabel: { color: '#6b7a99', fontFamily: FONTS.pixel, fontSize: 7, marginRight: 2 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
    backgroundColor: PIXEL.panel,
  },
  chipText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  filterPanel: {
    backgroundColor: PIXEL.panel,
    borderWidth: 2,
    borderColor: PIXEL.accent,
    padding: 10,
    gap: 6,
  },
  filterLabel: { color: '#6b7a99', fontFamily: FONTS.pixel, fontSize: 7, marginTop: 4 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  levelTo: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PIXEL.panelLight,
    borderWidth: 2,
    borderColor: '#000000',
  },
  stepValue: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 10, minWidth: 24, textAlign: 'center' },
  filterFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 4 },
  resetText: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },

  list: { padding: 16, paddingTop: 8, gap: 8 },
  listEmpty: { flexGrow: 1 },
  footerSpinner: { marginVertical: 12 },

  card: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 10 },
  cardExpanded: { borderColor: PIXEL.accent },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 46, height: 46, borderWidth: 2, backgroundColor: '#070b14', alignItems: 'center' },
  badgeTop: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 2 },
  badgeTopText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 6 },
  badgeLevel: { fontFamily: FONTS.pixel, fontSize: 13, marginTop: 5 },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#ffffff', fontFamily: FONTS.body, fontSize: 21 },
  cardSong: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 17 },
  cardAuthor: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 15 },
  ownedTag: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PIXEL.accent2,
    alignSelf: 'flex-start',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 2,
    borderTopColor: PIXEL.panelLight,
  },
  stat: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  statDot: { color: '#3a4a70', fontSize: 6 },

  panel: { marginTop: 8, gap: 8 },
  detailRow: { flexDirection: 'row', gap: 6 },
  detailBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#070b14',
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
  },
  detailLabel: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 14, letterSpacing: 1 },
  detailValue: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 10, marginTop: 3 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: PIXEL.accent2,
    borderWidth: 2,
    borderColor: '#000000',
  },
  primaryBtnDisabled: { backgroundColor: PIXEL.panelLight },
  primaryText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 10 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  bigIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PIXEL.panel,
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
  },
  infoTitle: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 11 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  code: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 17 },
  errorText: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 2,
    borderColor: PIXEL.accent2,
  },
  retryText: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 18 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#0b1a33',
    borderWidth: 2,
    borderColor: PIXEL.accent2,
  },
  bannerError: { borderColor: PIXEL.accent, backgroundColor: '#1a0d0a' },
  bannerText: { flex: 1, color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 17 },
});
