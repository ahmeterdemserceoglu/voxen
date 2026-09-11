import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  GestureResponderEvent,
} from 'react-native';
import { Colors } from '../constants/theme';
import { formatTime } from '../utils/formatters';

interface PlayerProgressBarProps {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
}

export const PlayerProgressBar: React.FC<PlayerProgressBarProps> = ({
  positionMs,
  durationMs,
  onSeek,
}) => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const sliderWidth = useRef(1);
  const scrubTarget = useRef(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);

  const durationSec = durationMs > 0 ? durationMs / 1000 : 0;
  const currentPosSec = isScrubbing
    ? scrubPosition / 1000
    : positionMs > 0
    ? positionMs / 1000
    : 0;

  const progressRatio =
    durationSec > 0 ? Math.min(1, Math.max(0, currentPosSec / durationSec)) : 0;

  const handleTouch = (evt: GestureResponderEvent) => {
    const { locationX } = evt.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / sliderWidth.current));
    const targetMs = ratio * durationMs;
    scrubTarget.current = targetMs;
    setScrubPosition(targetMs);
  };

  const handleRelease = (evt: GestureResponderEvent) => {
    handleTouch(evt);
    onSeek(scrubTarget.current);
    setIsScrubbing(false);
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.touchArea}
        onLayout={(evt) => { sliderWidth.current = Math.max(1, evt.nativeEvent.layout.width); }}
        onResponderTerminationRequest={() => false}
        onResponderTerminate={() => setIsScrubbing(false)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(evt) => {
          setIsScrubbing(true);
          handleTouch(evt);
        }}
        onResponderMove={handleTouch}
        onResponderRelease={handleRelease}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${progressRatio * 100}%` }]} />
          <View
            style={[
              styles.thumb,
              { left: `${Math.max(0, Math.min(97, progressRatio * 100))}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(currentPosSec)}</Text>
        <Text style={styles.timeText}>{formatTime(durationSec)}</Text>
      </View>
    </View>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 8,
  },
  touchArea: {
    height: 30,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    position: 'relative',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});

