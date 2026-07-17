import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { C } from '../theme';

export default function BigButton({
  label,
  onPress,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bigButton,
        kind === 'primary' ? styles.bigButtonPrimary : styles.bigButtonGhost,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={kind === 'primary' ? styles.bigButtonPrimaryText : styles.bigButtonGhostText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bigButton: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bigButtonPrimary: {
    backgroundColor: C.accent,
  },
  bigButtonPrimaryText: {
    color: '#0c2417',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
  },
  bigButtonGhost: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
  },
  bigButtonGhostText: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
