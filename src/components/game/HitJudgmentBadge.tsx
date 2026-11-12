import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HitJudgment } from '../../types/game';
import { ACTIVE_THEME } from '../../constants/theme';

interface HitJudgmentBadgeProps {
  judgment: HitJudgment | null;
  timeDiffMs?: number;
}

export const HitJudgmentBadge: React.FC<HitJudgmentBadgeProps> = ({ judgment, timeDiffMs }) => {
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
    <View pointerEvents="none" style={styles.container}>
      <Text
        style={[
          styles.judgmentText,
          {
            color: config.color,
            textShadowColor: config.glow,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 16,
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
    </View>
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
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
  },
  timeDiffText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: '#cbd5e1',
    marginTop: 2,
    opacity: 0.85,
  },
});
