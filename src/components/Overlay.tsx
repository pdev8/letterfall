import React from 'react';
import { StyleSheet, View } from 'react-native';

import PopIn from './PopIn';
import { C } from '../theme';

export default function Overlay({
  children,
  reduceMotion = false,
}: {
  children: React.ReactNode;
  reduceMotion?: boolean;
}) {
  return (
    <View style={styles.overlayScrim}>
      <PopIn style={styles.overlayCard} reduceMotion={reduceMotion}>
        {children}
      </PopIn>
    </View>
  );
}

const styles = StyleSheet.create({
  // overlays
  overlayScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 22,
    alignItems: 'center',
  },
});
