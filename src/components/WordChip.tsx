import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C } from '../theme';

export default function WordChip({ word, pts }: { word: string; pts?: number }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{word.toUpperCase()}</Text>
      {pts !== undefined ? <Text style={styles.chipPts}>+{pts}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceHi,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipPts: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '800',
  },
  chipText: {
    color: C.ink,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
