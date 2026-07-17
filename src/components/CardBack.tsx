import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cardShadow } from './cardShadow';
import { C } from '../theme';

export default function CardBack({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[styles.cardBack, { width, height, borderRadius: Math.max(6, Math.round(width * 0.15)) }]}
    >
      <Text style={[styles.cardBackSpade, { fontSize: Math.round(width * 0.42) }]}>♠</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // card backs
  cardBack: {
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  cardBackSpade: {
    color: C.accentFaint,
  },
});
