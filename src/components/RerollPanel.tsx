import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BigButton from './BigButton';
import LetterCard from './LetterCard';
import Overlay from './Overlay';
import { C } from '../theme';

/** One rerollable position: the face-up top of a column. */
export interface RerollTop {
  /** Column index in the tableau. */
  col: number;
  letter: string;
  /** False if the top isn't a native card (e.g. a parked stock card) — not swappable. */
  rerollable: boolean;
}

const CARD_W = 46;
const CARD_H = 64;

/**
 * Opening reroll (DB-178). Before play, the player sees the deal's face-up
 * column tops fanned out; tapping a card raises it (selected), tapping again
 * lowers it. "Swap" sends the raised tops to the bottom of the stock and rolls
 * the next stock cards up into their spots — one shot, then the panel closes
 * and the new board shows. "Skip" plays the deal as dealt. A straight letter
 * swap: the rolled-in cards are normal required cards, so you're trading known
 * letters for unknown ones. It's a gamble — the dealt board is winnable, a
 * rerolled one may not be.
 */
export default function RerollPanel({
  tops,
  onSwap,
  onSkip,
  reduceMotion = false,
}: {
  tops: RerollTop[];
  onSwap: (cols: number[]) => void;
  onSkip: () => void;
  reduceMotion?: boolean;
}) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (col: number) =>
    setSelected((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));

  const swap = () => {
    if (selected.length === 0) return;
    onSwap(selected); // one shot — the parent commits the reroll and closes the panel
  };

  return (
    <Overlay reduceMotion={reduceMotion}>
      <Text style={styles.title}>Rework your hand?</Text>
      <Text style={styles.sub}>
        Tap cards to raise them, then swap them into the stock for new ones. It&apos;s a gamble —
        you might draw better letters, or worse.
      </Text>

      <View style={styles.fan}>
        {tops.map((t) => {
          const isSel = selected.includes(t.col);
          return (
            <Pressable
              key={t.col}
              onPress={() => t.rerollable && toggle(t.col)}
              disabled={!t.rerollable}
              hitSlop={4}
              // Lift is layout, not transform (device-clipping lesson): a raised
              // card gains bottom margin so its whole body sits higher in the row.
              style={[styles.slot, { marginBottom: isSel ? 22 : 0 }, !t.rerollable && styles.locked]}
            >
              <LetterCard letter={t.letter} width={CARD_W} height={CARD_H} glow={isSel} lifted={isSel} />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.count}>
        {selected.length === 0 ? 'nothing selected' : `${selected.length} to swap`}
      </Text>

      <View style={styles.actions}>
        <View style={styles.action}>
          <BigButton label="SKIP" kind="ghost" onPress={onSkip} />
        </View>
        <View style={[styles.action, selected.length === 0 && styles.actionDisabled]}>
          <BigButton
            label={selected.length === 0 ? 'SWAP' : `SWAP ${selected.length}`}
            onPress={swap}
          />
        </View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  title: {
    color: C.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sub: {
    color: C.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  // Overlapping fan of the face-up column tops; aligned to the bottom so a
  // selected card visibly rises above the rest.
  fan: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: CARD_H + 22,
    marginBottom: 4,
  },
  slot: {
    marginHorizontal: -3, // slight overlap → a held-hand fan
  },
  locked: {
    opacity: 0.4,
  },
  count: {
    color: C.inkFaint,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
  },
  action: {
    flex: 1,
  },
  actionDisabled: {
    opacity: 0.5,
  },
});
