import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cardShadow } from './cardShadow';
import { C } from '../theme';

export default function LetterCard({
  letter,
  width,
  height,
  glow = false,
  lifted = false,
  stock = false,
}: {
  letter: string;
  width: number;
  height: number;
  glow?: boolean;
  lifted?: boolean;
  /** Stock-origin card (reserve top or parked): solid orange outline. */
  stock?: boolean;
}) {
  return (
    <View
      style={[
        styles.letterCard,
        { width, height, borderRadius: Math.max(6, Math.round(width * 0.15)) },
        glow && styles.letterCardGlow,
        stock && styles.letterCardStock,
        glow && stock && styles.letterCardStockGlow,
        lifted && styles.letterCardLifted,
        lifted && stock && styles.letterCardStockLifted,
      ]}
    >
      <Text
        style={[
          styles.letterCardCorner,
          { fontSize: Math.max(8, Math.round(width * 0.2)) },
          lifted && styles.letterCardInkLifted,
        ]}
      >
        {letter.toUpperCase()}
      </Text>
      <Text
        style={[
          styles.letterCardText,
          { fontSize: Math.round(width * 0.52) },
          lifted && styles.letterCardInkLifted,
        ]}
      >
        {letter.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // letter cards
  letterCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardEdge,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  letterCardGlow: {
    borderColor: C.accentDim,
    shadowColor: C.accent,
    shadowOpacity: 0.45,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  letterCardStock: {
    borderColor: C.stock,
  },
  letterCardStockGlow: {
    shadowColor: C.stock,
  },
  // Trayed cards ghost out but stay fully opaque so nothing shows through;
  // the 20% downshift happens in layout where the card is rendered. Each keeps
  // a border in the inactive (dim) shade of its accent: green for native
  // cards, orange for stock-origin cards.
  letterCardLifted: {
    backgroundColor: C.surfaceHi,
    borderColor: C.accentDim,
    shadowOpacity: 0,
    elevation: 0,
  },
  letterCardStockLifted: {
    borderColor: C.stockDim,
  },
  letterCardInkLifted: {
    color: C.inkFaint,
  },
  letterCardText: {
    color: C.cardInk,
    fontWeight: '800',
  },
  letterCardCorner: {
    position: 'absolute',
    top: 3,
    left: 4,
    color: C.cardInkSoft,
    fontWeight: '700',
  },
});
