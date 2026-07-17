import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Pops its children in on mount (scale + fade). Re-key to replay.
 * `reduceMotion` renders the final state instantly (DB-132).
 */
export default function PopIn({
  children,
  style,
  delay = 0,
  reduceMotion = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  reduceMotion?: boolean;
}) {
  const anim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    Animated.timing(anim, { toValue: 1, duration: 190, delay, useNativeDriver: true }).start();
  }, [anim, delay, reduceMotion]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}
