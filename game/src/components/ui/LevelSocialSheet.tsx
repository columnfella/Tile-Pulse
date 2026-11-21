/**
 * A community level's page: description, like / dislike (the score can go
 * negative), star difficulty votes (1–8; the majority becomes official at 200
 * votes, like Geometry Dash's community difficulty)
 * and comments (each can be liked / disliked; tap a name to see the profile).
 * Moderators also get tools here: verify / unverify the level, remove it, and
 * remove other people's comments (always with a reason the player is told).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PixelIcon } from './PixelIcon';
import { PressableScale } from './PressableScale';
import { useScreenInsets } from './useScreenInsets';
import { ProfileSheet } from './ProfileSheet';
import { BadgeIcon } from './Badges';
import { ReasonModal } from './ReasonModal';
import { FONTS, PIXEL } from '../../theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../services/communityApi';
import { getSession, isStaff, onSessionChange } from '../../services/account';
import { removeComment, removeLevel, unverifyLevel, verifyLevel } from '../../services/moderation';
import { avatarUrl } from '../../services/profile';
import {
  deleteComment,
  getComments,
  getSocial,
  postComment,
  rateLevel,
  voteComment,
  voteLevel,
  type LevelComment,
  type SocialState,
  type Vote,
  MAX_STARS,
} from '../../services/social';

import { C, alpha, themedStyles } from '../../theme/palette';
const COMMENT_MAX = 300;

const errorText = (err: unknown) =>
  err instanceof ApiUnavailableError
    ? `Can’t reach the community server (${API_BASE}).`
    : err instanceof Error
      ? err.message
      : 'Something went wrong.';

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(ms).toLocaleDateString();
}

/** 👍 / 👎 pair with the net score between them (red when negative). */
export function VoteButtons({
  score,
  myVote,
  onVote,
  disabled,
  busy,
  small,
}: {
  score: number;
  myVote: Vote;
  onVote: (v: Vote) => void;
  /** Signed out: shown dimmed. */
  disabled?: boolean;
  /** This vote is being sent: ignore taps, no visual change. */
  busy?: boolean;
  small?: boolean;
}) {
  const size = small ? 12 : 14;
  return (
    <View style={styles.voteRow}>
      <PressableScale
        scaleTo={0.85}
        disabled={disabled || busy}
        onPress={() => onVote(myVote === 1 ? 0 : 1)}
        style={[styles.voteBtn, small && styles.voteBtnSmall, myVote === 1 && styles.voteUpOn, disabled && styles.disabled]}
        accessibilityLabel="Like"
      >
        <PixelIcon name="thumbUp" size={size} color={myVote === 1 ? C.onAccent : C.success} />
      </PressableScale>
      <Text style={[styles.voteScore, small && styles.voteScoreSmall, score < 0 && styles.voteNegative, score > 0 && styles.votePositive]}>
        {score > 0 ? `+${score}` : score}
      </Text>
      <PressableScale
        scaleTo={0.85}
        disabled={disabled || busy}
        onPress={() => onVote(myVote === -1 ? 0 : -1)}
        style={[styles.voteBtn, small && styles.voteBtnSmall, myVote === -1 && styles.voteDownOn, disabled && styles.disabled]}
        accessibilityLabel="Dislike"
      >
        <PixelIcon name="thumbDown" size={size} color={myVote === -1 ? C.textStrong : C.dangerSoft} />
      </PressableScale>
    </View>
  );
}

/** Ten pixel stars; filled up to `value`. */
export function StarBar({
  value,
  size = 14,
  onPick,
}: {
  value: number;
  size?: number;
  onPick?: (stars: number) => void;
}) {
  return (
    <View style={styles.stars}>
      {Array.from({ length: MAX_STARS }, (_, i) => {
        const on = i < Math.round(value);
        const star = <PixelIcon name="star" size={size} color={on ? C.gold : C.lineStrong} />;
        return onPick ? (
          <PressableScale key={i} scaleTo={0.8} onPress={() => onPick(i + 1)} style={styles.starHit} accessibilityLabel={`${i + 1} stars`}>
            {star}
          </PressableScale>
        ) : (
          <View key={i}>{star}</View>
        );
      })}
    </View>
  );
}

interface Props {
  visible: boolean;
  levelId: string;
  name: string;
  description?: string | null;
  onClose: () => void;
  /** Called with fresh counts so the card can update. */
  onChanged?: (s: SocialState) => void;
  /** Verified by a moderator (only verified levels count for the leaderboard). */
  verified?: boolean;
  /** A moderator verified / unverified it here. */
  onVerifiedChange?: (verified: boolean) => void;
  /** A moderator removed the level here (the sheet closes). */
  onRemoved?: () => void;
}

const LEVEL_REASONS = ['Stolen / copied chart', 'Broken or unplayable', 'Inappropriate content', 'Spam'];
const COMMENT_REASONS = ['Spam', 'Rude or hateful', 'Inappropriate', 'Off-topic'];

export function LevelSocialSheet({
  visible,
  levelId,
  name,
  description,
  onClose,
  onChanged,
  verified = false,
  onVerifiedChange,
  onRemoved,
}: Props) {
  const insets = useScreenInsets();
  const [signedIn, setSignedIn] = useState(false);
  const [staff, setStaff] = useState(false);
  const [isVerified, setIsVerified] = useState(verified);
  // Which reason dialog is open: removing the level, or one comment
  const [asking, setAsking] = useState<{ kind: 'level' } | { kind: 'comment'; comment: LevelComment } | null>(null);
  useEffect(() => setIsVerified(verified), [verified]);
  const [social, setSocial] = useState<SocialState | null>(null);
  const [comments, setComments] = useState<LevelComment[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  // What is being sent right now: "level", "rate", "more" or a comment id.
  // Tracked per target so voting on the level doesn't dim the comment buttons.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const update = useCallback(
    (s: SocialState) => {
      setSocial(s);
      onChanged?.(s);
    },
    [onChanged]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([getSocial(levelId), getComments(levelId)]);
      setSocial(s);
      if (typeof s.verified === 'boolean') setIsVerified(s.verified);
      setComments(c.comments);
      setNextBefore(c.nextBefore);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [levelId]);

  useEffect(() => {
    if (!visible) return;
    void getSession().then((s) => {
      setSignedIn(Boolean(s));
      setStaff(isStaff(s?.user));
    });
    void load();
    return onSessionChange((s) => {
      setSignedIn(Boolean(s));
      setStaff(isStaff(s?.user));
    });
  }, [visible, load]);

  const act = async (key: string, fn: () => Promise<void>) => {
    if (busyKey === key) return;
    setBusyKey(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyKey((k) => (k === key ? null : k));
    }
  };

  const vote = (v: Vote) => act('level', async () => update(await voteLevel(levelId, v)));
  const voteOnComment = (c: LevelComment, v: Vote) =>
    act(c.id, async () => {
      const r = await voteComment(c.id, v);
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...r } : x)));
    });
  const rate = (stars: number) =>
    act('rate', async () => update(await rateLevel(levelId, social?.myRating === stars ? null : stars)));

  const send = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      const s = await postComment(levelId, body);
      update(s);
      setDraft('');
      const c = await getComments(levelId);
      setComments(c.comments);
      setNextBefore(c.nextBefore);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPosting(false);
    }
  };

  const remove = (c: LevelComment) =>
    act(c.id, async () => {
      await deleteComment(c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
      if (social) update({ ...social, comments: Math.max(0, social.comments - 1) });
    });

  const toggleVerified = () =>
    act('verify', async () => {
      const r = isVerified ? await unverifyLevel(levelId) : await verifyLevel(levelId);
      setIsVerified(r.verified);
      onVerifiedChange?.(r.verified);
    });

  const more = () =>
    act('more', async () => {
      if (!nextBefore) return;
      const c = await getComments(levelId, nextBefore);
      setComments((prev) => [...prev, ...c.comments]);
      setNextBefore(c.nextBefore);
    });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <PixelIcon name="comment" size={14} color={PIXEL.accent2} />
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
            {isVerified ? (
              <View style={styles.verifiedChip}>
                <PixelIcon name="check" size={10} color={C.onAccent} />
                <Text style={styles.verifiedText}>VERIFIED</Text>
              </View>
            ) : null}
          </View>
          <PressableScale scaleTo={0.88} style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <PixelIcon name="close" size={14} color={C.textSoft} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {description ? <Text style={styles.description}>{description}</Text> : null}

          {!isVerified ? (
            <Text style={styles.muted}>Not verified yet: scores on this level don’t count for the leaderboard.</Text>
          ) : null}

          {staff ? (
            <View style={[styles.section, styles.modSection]}>
              <View style={styles.modHead}>
                <PixelIcon name="shield" size={12} color={C.successBright} />
                <Text style={styles.modTitle}>MODERATOR</Text>
              </View>
              <View style={styles.modRow}>
                <PressableScale
                  scaleTo={0.95}
                  onPress={toggleVerified}
                  disabled={busyKey === 'verify'}
                  style={[styles.modBtn, isVerified ? styles.modBtnOff : styles.modBtnOn]}
                >
                  {busyKey === 'verify' ? <ActivityIndicator size="small" color={C.onAccent} /> : <PixelIcon name="check" size={11} color={isVerified ? C.successBright : C.onAccent} />}
                  <Text style={[styles.modBtnText, isVerified && styles.modBtnTextOff]}>{isVerified ? 'UNVERIFY' : 'VERIFY'}</Text>
                </PressableScale>
                <PressableScale scaleTo={0.95} onPress={() => setAsking({ kind: 'level' })} style={[styles.modBtn, styles.modBtnDanger]}>
                  <PixelIcon name="trash" size={11} color={C.textStrong} />
                  <Text style={[styles.modBtnText, styles.modBtnTextDanger]}>REMOVE LEVEL</Text>
                </PressableScale>
              </View>
            </View>
          ) : null}

          {/* Likes / dislikes */}
          <View style={styles.section}>
            {social ? (
              <>
                <View style={styles.likeRow}>
                  <View>
                    <VoteButtons score={social.score} myVote={social.myVote} onVote={vote} disabled={!signedIn} busy={busyKey === 'level'} />
                    <Text style={styles.muted}>
                      {social.likes} likes · {social.dislikes} dislikes
                    </Text>
                  </View>
                </View>
              </>
            ) : loading ? (
              <ActivityIndicator color={PIXEL.accent2} />
            ) : null}
          </View>

          {/* Star difficulty: majority vote, official at the threshold */}
          {social ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DIFFICULTY</Text>
              <View style={styles.diffHead}>
                <View>
                  <Text style={styles.diffStars}>
                    {social.difficulty.stars ?? social.difficulty.leading ?? '–'}
                    <Text style={styles.diffOf}> / {MAX_STARS}★</Text>
                  </Text>
                  <Text style={styles.muted}>
                    {social.difficulty.stars
                      ? 'Community difficulty'
                      : social.difficulty.leading
                        ? 'Leading vote (not official yet)'
                        : 'No votes yet'}
                  </Text>
                </View>
                <View style={styles.diffCount}>
                  <Text style={styles.diffVotes}>{social.difficulty.votes}</Text>
                  <Text style={styles.muted}>votes</Text>
                </View>
              </View>
              <StarBar value={social.difficulty.stars ?? social.difficulty.leading ?? 0} size={14} />
              {!social.difficulty.stars ? (
                <>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(100, (social.difficulty.votes / social.difficulty.threshold) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.muted}>
                    {Math.max(0, social.difficulty.threshold - social.difficulty.votes)} more votes until the community’s
                    majority becomes this level’s official difficulty.
                  </Text>
                </>
              ) : null}

              {/* How the votes are spread over 1–8 stars */}
              {social.difficulty.votes > 0 ? (
                <View style={styles.dist}>
                  {social.difficulty.distribution.map((n, i) => {
                    const max = Math.max(...social.difficulty.distribution, 1);
                    const top = i + 1 === (social.difficulty.stars ?? social.difficulty.leading);
                    return (
                      <View key={i} style={styles.distCol}>
                        <Text style={styles.distN}>{n}</Text>
                        <View style={styles.distTrack}>
                          <View style={[styles.distBar, { height: `${(n / max) * 100}%` }, top && styles.distBarTop]} />
                        </View>
                        <Text style={[styles.distLabel, top && styles.distLabelTop]}>{i + 1}★</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Text style={styles.label}>YOUR VOTE</Text>
              {!signedIn ? (
                <Text style={styles.muted}>Sign in (Profile tab) to vote, like and comment.</Text>
              ) : social.canRate ? (
                <>
                  <StarBar value={social.myRating ?? 0} size={22} onPick={rate} />
                  <Text style={styles.muted}>
                    {social.myRating
                      ? `You voted ${social.myRating}★. Tap it again to remove your vote.`
                      : 'How hard is it? 1★ = easiest, 8★ = hardest.'}
                  </Text>
                </>
              ) : (
                <Text style={styles.muted}>Finish this level once (signed in) to vote on its difficulty.</Text>
              )}
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Comments */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>COMMENTS {social ? `(${social.comments})` : ''}</Text>
            {signedIn ? (
              <View style={styles.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Say something nice…"
                  placeholderTextColor={C.textSubtle}
                  maxLength={COMMENT_MAX}
                  multiline
                  style={styles.input}
                />
                <View style={styles.composerRow}>
                  <Text style={styles.muted}>
                    {draft.length}/{COMMENT_MAX}
                  </Text>
                  <PressableScale
                    scaleTo={0.94}
                    disabled={!draft.trim() || posting}
                    onPress={send}
                    style={[styles.sendBtn, (!draft.trim() || posting) && styles.disabled]}
                  >
                    {posting ? <ActivityIndicator size="small" color={C.onAccent} /> : null}
                    <Text style={styles.sendText}>POST</Text>
                  </PressableScale>
                </View>
              </View>
            ) : null}

            {comments.length === 0 && !loading ? <Text style={styles.muted}>No comments yet. Be the first!</Text> : null}
            {comments.map((c) => {
              const av = avatarUrl(c.author.id, c.author.avatar);
              return (
                <View key={c.id} style={styles.comment}>
                  <PressableScale scaleTo={0.9} onPress={() => setViewing(c.author.username)} style={styles.avatar} accessibilityLabel={`See @${c.author.username}'s profile`}>
                    {av ? (
                      <Image source={{ uri: av }} style={StyleSheet.absoluteFill} />
                    ) : (
                      <Text style={styles.avatarText}>{(c.author.displayName[0] ?? '?').toUpperCase()}</Text>
                    )}
                  </PressableScale>
                  <View style={styles.flex}>
                    <PressableScale scaleTo={0.97} onPress={() => setViewing(c.author.username)} style={styles.commentHead}>
                      <Text style={styles.commentName} numberOfLines={1}>
                        {c.author.displayName}
                      </Text>
                      <BadgeIcon id={c.author.badge} size={11} />
                      <Text style={styles.muted} numberOfLines={1}>
                        {'  '}@{c.author.username} · {timeAgo(c.createdAt)}
                      </Text>
                    </PressableScale>
                    <Text style={styles.commentBody}>{c.body}</Text>
                    <VoteButtons small score={c.score ?? 0} myVote={c.myVote ?? 0} onVote={(v) => voteOnComment(c, v)} disabled={!signedIn} busy={busyKey === c.id} />
                  </View>
                  {c.canModerate ? (
                    // Moderator: remove with a reason (the writer is told why)
                    <PressableScale scaleTo={0.85} onPress={() => setAsking({ kind: 'comment', comment: c })} style={styles.deleteBtn} accessibilityLabel="Remove comment (moderator)">
                      <PixelIcon name="shield" size={12} color={C.dangerSoft} />
                    </PressableScale>
                  ) : c.canDelete ? (
                    <PressableScale scaleTo={0.85} onPress={() => remove(c)} style={styles.deleteBtn} accessibilityLabel="Delete comment">
                      <PixelIcon name="trash" size={12} color={PIXEL.textDim} />
                    </PressableScale>
                  ) : null}
                </View>
              );
            })}
            {nextBefore ? (
              <PressableScale scaleTo={0.96} onPress={more} style={styles.moreBtn}>
                <Text style={styles.moreText}>LOAD MORE</Text>
              </PressableScale>
            ) : null}
          </View>
        </ScrollView>
        <ProfileSheet username={viewing} onClose={() => setViewing(null)} />
        <ReasonModal
          visible={asking !== null}
          title={asking?.kind === 'level' ? 'REMOVE LEVEL' : 'REMOVE COMMENT'}
          message={
            asking?.kind === 'level'
              ? `"${name}" will be deleted for everyone. The creator is told the reason.`
              : 'The comment will be deleted. Its writer is told the reason.'
          }
          confirmLabel="REMOVE"
          destructive
          presets={asking?.kind === 'level' ? LEVEL_REASONS : COMMENT_REASONS}
          onClose={() => setAsking(null)}
          onConfirm={async (reason) => {
            if (asking?.kind === 'level') {
              await removeLevel(levelId, reason);
              onRemoved?.();
              onClose();
            } else if (asking?.kind === 'comment') {
              const target = asking.comment;
              await removeComment(target.id, reason);
              setComments((prev) => prev.filter((x) => x.id !== target.id));
              if (social) update({ ...social, comments: Math.max(0, social.comments - 1) });
            }
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 11, flex: 1 },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: C.outline },
  scroll: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  description: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 19, lineHeight: 22 },
  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 8 },
  sectionTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 9 },
  label: { color: C.textSubtle, fontFamily: FONTS.pixel, fontSize: 7, marginTop: 6 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  disabled: { opacity: 0.45 },

  likeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  voteBtn: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: C.bgDeep },
  voteBtnSmall: { width: 30, height: 24 },
  voteUpOn: { backgroundColor: C.success, borderColor: C.outline },
  voteDownOn: { backgroundColor: C.danger, borderColor: C.outline },
  voteScore: { color: PIXEL.text, fontFamily: FONTS.pixel, fontSize: 11, minWidth: 34, textAlign: 'center' },
  voteScoreSmall: { fontSize: 8, minWidth: 26 },
  votePositive: { color: C.success },
  voteNegative: { color: C.dangerSoft },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: C.secondary, backgroundColor: alpha(C.secondary, 0.1) },
  likeBtnOn: { backgroundColor: C.secondary, borderColor: C.outline },
  likeText: { color: C.secondary, fontFamily: FONTS.pixel, fontSize: 8 },
  likeTextOn: { color: C.onAccent },
  diffHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  diffStars: { color: C.gold, fontFamily: FONTS.pixel, fontSize: 20 },
  diffOf: { color: C.textSubtle, fontSize: 10 },
  diffCount: { alignItems: 'flex-end' },
  diffVotes: { color: PIXEL.text, fontFamily: FONTS.pixel, fontSize: 12 },
  progressTrack: { height: 6, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: PIXEL.panelLight },
  progressFill: { height: '100%', backgroundColor: C.gold },
  dist: { flexDirection: 'row', gap: 4, marginTop: 4 },
  distCol: { flex: 1, alignItems: 'center', gap: 2 },
  distN: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 13 },
  distTrack: { width: '100%', height: 46, justifyContent: 'flex-end', backgroundColor: C.bgDeep },
  distBar: { width: '100%', backgroundColor: C.lineStrong },
  distBarTop: { backgroundColor: C.gold },
  distLabel: { color: C.textSubtle, fontFamily: FONTS.pixel, fontSize: 6 },
  distLabelTop: { color: C.gold },
  stars: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center' },
  starHit: { padding: 2 },

  composer: { gap: 6 },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 19,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: C.outline },
  sendText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 8 },

  comment: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.lineSoft },
  avatar: { width: 32, height: 32, backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: C.outline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 10 },
  commentHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  commentName: { color: C.textStrong, fontFamily: FONTS.body, fontSize: 18, flexShrink: 1 },
  verifiedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.blue, borderWidth: 2, borderColor: C.outline, paddingHorizontal: 5, paddingVertical: 3 },
  verifiedText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 6 },
  modSection: { borderColor: C.successDeep, backgroundColor: alpha(C.successBright, 0.05) },
  modHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modTitle: { color: C.successBright, fontFamily: FONTS.pixel, fontSize: 8 },
  modRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 2, borderColor: C.outline },
  modBtnOn: { backgroundColor: C.successBright },
  modBtnOff: { backgroundColor: 'transparent', borderColor: C.successDeep },
  modBtnDanger: { backgroundColor: C.danger },
  modBtnText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 7 },
  modBtnTextOff: { color: C.successBright },
  modBtnTextDanger: { color: C.textStrong },
  commentBody: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 18, marginTop: 2 },
  deleteBtn: { padding: 6 },
  moreBtn: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: PIXEL.panelLight },
  moreText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 8 },
}));
