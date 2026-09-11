import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import { Colors } from '../constants/theme';

interface SkeletonCardProps {
  variant?: 'track' | 'card' | 'circle';
  width?: number | string;
  height?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  variant = 'card',
  width,
  height,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacityAnim]);

  if (variant === 'circle') {
    const size = typeof width === 'number' ? width : 56;
    return (
      <Animated.View
        style={[
          styles.base,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: opacityAnim,
          },
        ]}
      />
    );
  }

  if (variant === 'track') {
    return (
      <View style={styles.trackContainer}>
        <Animated.View style={[styles.base, styles.trackThumb, { opacity: opacityAnim }]} />
        <View style={styles.trackInfo}>
          <Animated.View style={[styles.base, styles.trackTitleBar, { opacity: opacityAnim }]} />
          <Animated.View style={[styles.base, styles.trackSubBar, { opacity: opacityAnim }]} />
        </View>
      </View>
    );
  }

  // default 'card'
  return (
    <Animated.View
      style={[
        styles.base,
        styles.card,
        width !== undefined ? ({ width } as any) : undefined,
        height !== undefined ? { height } : undefined,
        { opacity: opacityAnim },
      ]}
    />
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  base: {
    backgroundColor: Colors.surfaceElevated,
  },
  card: {
    width: 140,
    height: 140,
    borderRadius: 14,
  },
  trackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  trackThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  trackInfo: {
    flex: 1,
    gap: 6,
  },
  trackTitleBar: {
    height: 14,
    width: '65%',
    borderRadius: 4,
  },
  trackSubBar: {
    height: 10,
    width: '40%',
    borderRadius: 4,
  },
});

