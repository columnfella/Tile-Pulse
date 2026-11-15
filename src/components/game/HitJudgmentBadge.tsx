import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { popIn } from '../ui/motion';
import { HitJudgment } from '../../types/game';
import { ACTIVE_THEME } from '../../constants/theme';
import { FONTS } from '../../theme/pixel';

interface HitJudgmentBadgeProps {
  judgment: HitJudgment | null;
  timeDiffMs?: number;
  /** Changes on every hit so the badge re-pops even for repeated judgments. */
  hitId?: number;
}

export const HitJudgmentBadge: React.FC<HitJudgmentBadgeProps> = ({ judgment, timeDiffMs, hitId }) => {
  if (!judgment) return null;

  const { judgments } = ACTIVE_THEME.feedback;
  let config = judgments.perfect;

  switch (judgment) {
    case 'PERFECT':
      config = judgments.perfect;
      break;
    case 'GREAT':
      config = judgments.great;
      break;
    case 'GOOD':
      config = judgments.good;
      break;
    case 'MISS':
      config = judgments.miss;
      break;
  }

  return (
    <Animated.View
      key={hitId}
      entering={popIn}
      exiting={FadeOut.duration(120)}
      pointerEvents="none"
      style={styles.container}
    >
      <Text
        style={[
          styles.judgmentText,
          {
            color: config.color,
            textShadowColor: config.glow,
            textShadowOffset: { width: 3, height: 3 },
            textShadowRadius: 0.1, // hard pixel shadow
          },
        ]}
      >
        {config.text}
      </Text>

      {judgment !== 'MISS' && typeof timeDiffMs === 'number' && (
        <Text style={styles.timeDiffText}>
          {timeDiffMs > 0 ? `+${timeDiffMs}ms` : `${timeDiffMs}ms`}
        </Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '32%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  judgmentText: {
    fontFamily: FONTS.pixel,
    fontSize: 18,
    letterSpacing: 1,
  },
  timeDiffText: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: '#cdd6ea',
    marginTop: 2,
    opacity: 0.85,
  },
});
