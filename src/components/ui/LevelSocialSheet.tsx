/**
 * A community level's page: description, like / dislike (the score can go
 * negative), star rating (1–10, after finishing it once, like Geometry Dash)
 * and comments (each can be liked / disliked; tap a name to see the profile).
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
import { FONTS, PIXEL } from '../../theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../services/communityApi';
import { getSession, onSessionChange } from '../../services/account';
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
} from '../../services/social';

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
  small,
}: {
  score: number;
  myVote: Vote;
  onVote: (v: Vote) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const size = small ? 12 : 14;
  return (
    <View style={styles.voteRow}>
      <PressableScale
        scaleTo={0.85}
        disabled={disabled}
        onPress={() => onVote(myVote === 1 ? 0 : 1)}
        style={[styles.voteBtn, small && styles.voteBtnSmall, myVote === 1 && styles.voteUpOn, disabled && styles.disabled]}
        accessibilityLabel="Like"
      >
        <PixelIcon name="thumbUp" size={size} color={myVote === 1 ? '#000000' : '#22c46e'} />
      </PressableScale>
      <Text style={[styles.voteScore, small && styles.voteScoreSmall, score < 0 && styles.voteNegative, score > 0 && styles.votePositive]}>
        {score > 0 ? `+${score}` : score}
      </Text>
      <PressableScale
        scaleTo={0.85}
        disabled={disabled}
        onPress={() => onVote(myVote === -1 ? 0 : -1)}
        style={[styles.voteBtn, small && styles.voteBtnSmall, myVote === -1 && styles.voteDownOn, disabled && styles.disabled]}
        accessibilityLabel="Dislike"
      >
        <PixelIcon name="thumbDown" size={size} color={myVote === -1 ? '#ffffff' : '#ff7a73'} />
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
      {Array.from({ length: 10 }, (_, i) => {
        const on = i < Math.round(value);
        const star = <PixelIcon name="star" size={size} color={on ? '#f5b83d' : '#2a3654'} />;
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
}

export function LevelSocialSheet({ visible, levelId, name, description, onClose, onChanged }: Props) {
  const insets = useScreenInsets();
  const [signedIn, setSignedIn] = useState(false);
  const [social, setSocial] = useState<SocialState | null>(null);
  const [comments, setComments] = useState<LevelComment[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
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
    void getSession().then((s) => setSignedIn(Boolean(s)));
    void load();
    return onSessionChange((s) => setSignedIn(Boolean(s)));
  }, [visible, load]);

  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const vote = (v: Vote) => act(async () => update(await voteLevel(levelId, v)));
  const voteOnComment = (c: LevelComment, v: Vote) =>
    act(async () => {
      const r = await voteComment(c.id, v);
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...r } : x)));
    });
  const rate = (stars: number) =>
    act(async () => update(await rateLevel(levelId, social?.myRating === stars ? null : stars)));

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
    act(async () => {
      await deleteComment(c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
      if (social) update({ ...social, comments: Math.max(0, social.comments - 1) });
    });

  const more = () =>
    act(async () => {
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
          </View>
          <PressableScale scaleTo={0.88} style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <PixelIcon name="close" size={14} color="#cdd6ea" />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {description ? <Text style={styles.description}>{description}</Text> : null}

          {/* Like + rating */}
          <View style={styles.section}>
            {social ? (
              <>
                <View style={styles.likeRow}>
                  <View>
                    <VoteButtons score={social.score} myVote={social.myVote} onVote={vote} disabled={!signedIn || busy} />
                    <Text style={styles.muted}>
                      {social.likes} likes · {social.dislikes} dislikes
                    </Text>
                  </View>
                  <View style={styles.ratingSummary}>
                    <Text style={styles.ratingValue}>{social.rating.average ?? '–'}</Text>
                    <Text style={styles.muted}>
                      {social.rating.count} {social.rating.count === 1 ? 'rating' : 'ratings'}
                    </Text>
                  </View>
                </View>
                <StarBar value={social.rating.average ?? 0} size={12} />

                <Text style={styles.label}>YOUR RATING</Text>
                {!signedIn ? (
                  <Text style={styles.muted}>Sign in (Profile tab) to like, rate and comment.</Text>
                ) : social.canRate ? (
                  <>
                    <StarBar value={social.myRating ?? 0} size={18} onPick={rate} />
                    <Text style={styles.muted}>
                      {social.myRating ? `You gave it ${social.myRating}/10. Tap it again to remove.` : 'How hard was it? Tap 1–10 stars.'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.muted}>Finish this level once (signed in) to rate it.</Text>
                )}
              </>
            ) : loading ? (
              <ActivityIndicator color={PIXEL.accent2} />
            ) : null}
          </View>

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
                  placeholderTextColor="#6b7a99"
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
                    {posting ? <ActivityIndicator size="small" color="#000000" /> : null}
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
                    <PressableScale scaleTo={0.97} onPress={() => setViewing(c.author.username)}>
                      <Text style={styles.commentHead}>
                        <Text style={styles.commentName}>{c.author.displayName}</Text>
                        <Text style={styles.muted}>  @{c.author.username} · {timeAgo(c.createdAt)}</Text>
                      </Text>
                    </PressableScale>
                    <Text style={styles.commentBody}>{c.body}</Text>
                    <VoteButtons small score={c.score ?? 0} myVote={c.myVote ?? 0} onVote={(v) => voteOnComment(c, v)} disabled={!signedIn || busy} />
                  </View>
                  {c.canDelete ? (
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 11, flex: 1 },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: '#000000' },
  scroll: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  description: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 19, lineHeight: 22 },
  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 8 },
  sectionTitle: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 9 },
  label: { color: '#6b7a99', fontFamily: FONTS.pixel, fontSize: 7, marginTop: 6 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  disabled: { opacity: 0.45 },

  likeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  voteBtn: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: '#070b14' },
  voteBtnSmall: { width: 30, height: 24 },
  voteUpOn: { backgroundColor: '#22c46e', borderColor: '#000000' },
  voteDownOn: { backgroundColor: '#d8342f', borderColor: '#000000' },
  voteScore: { color: PIXEL.text, fontFamily: FONTS.pixel, fontSize: 11, minWidth: 34, textAlign: 'center' },
  voteScoreSmall: { fontSize: 8, minWidth: 26 },
  votePositive: { color: '#22c46e' },
  voteNegative: { color: '#ff7a73' },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: '#ff7a9a', backgroundColor: 'rgba(255, 122, 154, 0.08)' },
  likeBtnOn: { backgroundColor: '#e64980', borderColor: '#000000' },
  likeText: { color: '#ff7a9a', fontFamily: FONTS.pixel, fontSize: 8 },
  likeTextOn: { color: '#ffffff' },
  ratingSummary: { alignItems: 'flex-end' },
  ratingValue: { color: '#f5b83d', fontFamily: FONTS.pixel, fontSize: 16 },
  stars: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center' },
  starHit: { padding: 2 },

  composer: { gap: 6 },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 19,
    backgroundColor: '#070b14',
    borderWidth: 2,
    borderColor: '#1f2e52',
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: '#000000' },
  sendText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 8 },

  comment: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#111a2e' },
  avatar: { width: 32, height: 32, backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: '#000000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 10 },
  commentHead: { flexDirection: 'row' },
  commentName: { color: '#ffffff', fontFamily: FONTS.body, fontSize: 18 },
  commentBody: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 18, marginTop: 2 },
  deleteBtn: { padding: 6 },
  moreBtn: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: PIXEL.panelLight },
  moreText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 8 },
});
