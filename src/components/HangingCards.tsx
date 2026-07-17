import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Accelerometer } from 'expo-sensors';

import LetterCard from './LetterCard';
import { C } from '../theme';

// Title-screen ambience (DB-168): the DECKABET letters are cards hung on strings
// on roughly one line. They're pulled up from below, whipping into place like a
// real string (a 3-link rope that bends, plus a damped pendulum swing-in), then
// dangle gently. The scene parallax-shifts with the phone's tilt. Honors
// reduce-motion with a still, level row.

const LETTERS = 'DECKABET'.split('');
const SEGMENTS = 3; // string links — more = ropier bend
const PARALLAX = 16; // px shift at full tilt, scaled by depth
const STRING_W = 1.5;
const SEG_AMP = [1.1, 1.5, 2.1]; // idle bend per link, growing toward the card
const DEG = { inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] };

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Hanger {
  letter: string;
  x: number; // card center x
  stringLen: number; // top edge → card top at rest
  cardW: number;
  cardH: number;
  depth: number;
  startAngle: number; // pendulum swing-in
  period: number; // idle sway ms
  delay: number; // rise stagger
}

function makeHangers(width: number, height: number): Hanger[] {
  const n = LETTERS.length;
  const margin = 16;
  const gap = 5;
  const cardW = Math.max(30, Math.floor((width - 2 * margin - (n - 1) * gap) / n));
  const cardH = Math.round(cardW * 1.4);
  const totalW = n * cardW + (n - 1) * gap;
  const startX = (width - totalW) / 2;
  const baseTop = Math.round(height * 0.42); // the shared line the word hangs on (where the title sat)
  return LETTERS.map((letter, i) => ({
    letter,
    x: Math.round(startX + i * (cardW + gap) + cardW / 2),
    stringLen: baseTop + Math.round(rand(-12, 12)), // slight per-card offset
    cardW,
    cardH,
    depth: rand(0.82, 1),
    startAngle: rand(9, 15) * (i % 2 === 0 ? 1 : -1),
    period: rand(2800, 3800),
    delay: Math.round(i * 60 + rand(0, 120)),
  }));
}

export default function HangingCards({ reduceMotion = false }: { reduceMotion?: boolean }) {
  const { width, height } = useWindowDimensions();
  const hangers = useMemo(() => makeHangers(width, height), [width, height]);

  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const rise = useMemo(() => hangers.map(() => new Animated.Value(reduceMotion ? 1 : 0)), [hangers, reduceMotion]);
  const entry = useMemo(() => hangers.map((h) => new Animated.Value(reduceMotion ? 0 : h.startAngle)), [hangers, reduceMotion]);
  // Per-card, per-segment idle bend.
  const sways = useMemo(
    () => hangers.map(() => SEG_AMP.map(() => new Animated.Value(0))),
    [hangers],
  );

  useEffect(() => {
    if (reduceMotion) return;
    // Smooth vertical reel-up (ease-out, no bounce) + a damped pendulum swing-in
    // (spring overshoots and settles → the rope whips into place).
    const anims = hangers.flatMap((h, i) => [
      Animated.sequence([
        Animated.delay(h.delay),
        Animated.timing(rise[i], {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(h.delay),
        Animated.spring(entry[i], {
          toValue: 0,
          friction: 4.5,
          tension: 26,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anims.forEach((a) => a.start());

    // Gentle continuous rope bend — each link phase-lagged so a soft wave runs
    // down the string.
    const loops = sways.flatMap((segs, i) =>
      segs.map((v, s) => {
        const amp = SEG_AMP[s];
        const half = hangers[i].period / 2;
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(s * (hangers[i].period / 6)),
            Animated.timing(v, { toValue: -amp, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(v, { toValue: amp, duration: hangers[i].period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        );
        loop.start();
        return loop;
      }),
    );
    return () => {
      anims.forEach((a) => a.stop());
      loops.forEach((l) => l.stop());
    };
  }, [hangers, rise, entry, sways, reduceMotion]);

  // Accelerometer → parallax tilt (heavily low-passed for smoothness).
  useEffect(() => {
    if (reduceMotion) return;
    let sx = 0;
    let sy = 0;
    let sub: { remove: () => void } | null = null;
    try {
      Accelerometer.setUpdateInterval(16);
      sub = Accelerometer.addListener(({ x, y }) => {
        sx = sx * 0.9 + clamp(x, -1, 1) * 0.1;
        sy = sy * 0.9 + clamp(-y, -1, 1) * 0.1;
        tilt.setValue({ x: sx, y: sy });
      });
    } catch {
      // no sensor — cards hang level
    }
    return () => sub?.remove();
  }, [tilt, reduceMotion]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hangers.map((h, i) => {
        const segLen = h.stringLen / SEGMENTS;
        const start = height - h.stringLen + h.cardH + 100; // begins fully below screen
        const riseY = rise[i].interpolate({ inputRange: [0, 1], outputRange: [start, 0] });
        const px = Animated.multiply(tilt.x, h.depth * PARALLAX);
        const py = Animated.multiply(tilt.y, h.depth * PARALLAX);
        const d = (h.stringLen + h.cardH) / 2; // pivot-to-top offset for the whole rope
        const outerRot = Animated.add(entry[i], sways[i][0]).interpolate(DEG);

        // Build the rope inside-out: card, then wrap in each link (each bends a
        // little around its own top).
        let node: React.ReactNode = <LetterCard letter={h.letter} width={h.cardW} height={h.cardH} />;
        for (let s = SEGMENTS - 1; s >= 0; s--) {
          const rot = s === 0 ? outerRot : sways[i][s].interpolate(DEG);
          const isOuter = s === 0;
          node = (
            <Animated.View
              key={s}
              style={{
                width: h.cardW,
                alignItems: 'center',
                transform: isOuter
                  ? [
                      { translateX: px },
                      { translateY: Animated.add(riseY, py) },
                      { translateY: -d },
                      { rotate: rot },
                      { translateY: d },
                    ]
                  : [{ translateY: -segLen / 2 }, { rotate: rot }, { translateY: segLen / 2 }],
              }}
            >
              <View style={[styles.string, { height: segLen }]} />
              {node}
            </Animated.View>
          );
        }

        return (
          <View key={i} style={[styles.anchor, { left: h.x - h.cardW / 2, width: h.cardW }]}>
            {node}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  string: {
    width: STRING_W,
    backgroundColor: C.border,
  },
});
