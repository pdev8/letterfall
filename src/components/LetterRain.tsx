import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { C } from '../theme';

// Ambient title-screen animation: a sparse Matrix-style rain of letters, and
// every so often a column of them "turns" and lines up into a horizontal word
// that lights up and ghosts away. Pure decoration — no game state, no lexicon
// dependency. Honors reduce-motion (renders a calm static scatter instead).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// Thematic words the rain occasionally spells out.
const WORDS = [
  'DECKABET',
  'KLONDIKE',
  'TABLEAU',
  'RESERVE',
  'SHUFFLE',
  'LETTERS',
  'SPELL',
  'STREAK',
  'STOCK',
  'WORDS',
  'WINNER',
  'ENCORE',
];

const rand = (n: number): number => Math.floor(Math.random() * n);
const randLetter = (): string => ALPHABET[rand(26)];

interface Stream {
  x: number;
  letters: string[];
  fontSize: number;
  lineH: number;
  stripH: number;
  duration: number;
  delay: number;
}

function makeStreams(width: number, count: number): Stream[] {
  const cellW = width / count;
  return Array.from({ length: count }, (_, i) => {
    const fontSize = 15 + rand(9); // 15–23
    const lineH = Math.round(fontSize * 1.25);
    const len = 6 + rand(7); // 6–12 letters
    return {
      // Jitter within each cell so the columns aren't a rigid grid.
      x: Math.round(i * cellW + cellW * (0.15 + Math.random() * 0.6)),
      letters: Array.from({ length: len }, randLetter),
      fontSize,
      lineH,
      stripH: len * lineH,
      duration: 6500 + rand(6000), // 6.5–12.5s to fall
      delay: rand(4500),
    };
  });
}

/** A word that turns in, glows, and ghosts away, then calls onDone. */
function RainWord({
  text,
  width,
  height,
  onDone,
}: {
  text: string;
  width: number;
  height: number;
  onDone: () => void;
}) {
  const letters = useMemo(() => text.split(''), [text]);
  const enter = useRef(letters.map(() => new Animated.Value(0))).current;
  const out = useRef(new Animated.Value(0)).current;
  // Place the word in a band above or below the centered menu, never over it.
  const top = useMemo(() => {
    const band = Math.random() < 0.5 ? [0.12, 0.3] : [0.66, 0.82];
    return Math.round(height * (band[0] + Math.random() * (band[1] - band[0])));
  }, [height]);

  useEffect(() => {
    const intro = Animated.stagger(
      70,
      enter.map((v) =>
        Animated.spring(v, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      ),
    );
    const seq = Animated.sequence([intro, Animated.delay(1150)]);
    seq.start(({ finished }) => {
      if (!finished) return;
      Animated.timing(out, { toValue: 1, duration: 520, useNativeDriver: true }).start(
        ({ finished: done }) => done && onDone(),
      );
    });
    return () => seq.stop();
  }, [enter, out, onDone]);

  const containerOpacity = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View pointerEvents="none" style={[styles.wordRow, { top, width, opacity: containerOpacity }]}>
      {letters.map((ch, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.wordLetter,
            {
              opacity: enter[i],
              transform: [
                { perspective: 500 },
                {
                  rotateX: enter[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: ['90deg', '0deg'],
                  }),
                },
                { scale: enter[i].interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        >
          {ch}
        </Animated.Text>
      ))}
    </Animated.View>
  );
}

export default function LetterRain({ reduceMotion = false }: { reduceMotion?: boolean }) {
  const { width, height } = useWindowDimensions();
  // Sparse: a handful of columns with gaps, never a full grid.
  const streamCount = Math.max(5, Math.min(9, Math.round(width / 52)));
  const streams = useMemo(() => makeStreams(width, streamCount), [width, streamCount]);
  const falls = useMemo(() => streams.map(() => new Animated.Value(0)), [streams]);

  const [word, setWord] = useState<{ text: string; key: number } | null>(null);
  const spawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);

  // Falling streams.
  useEffect(() => {
    if (reduceMotion) return;
    const loops = falls.map((v, i) => {
      const s = streams[i];
      const loop = Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: s.duration,
          delay: s.delay,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, [falls, streams, reduceMotion]);

  // Occasional word events.
  useEffect(() => {
    if (reduceMotion) return;
    const schedule = (delay: number) => {
      spawnTimer.current = setTimeout(() => {
        setWord({ text: WORDS[rand(WORDS.length)], key: keyRef.current++ });
      }, delay);
    };
    schedule(1600);
    return () => {
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
    };
  }, [reduceMotion]);

  const onWordDone = () => {
    setWord(null);
    spawnTimer.current = setTimeout(() => {
      setWord({ text: WORDS[rand(WORDS.length)], key: keyRef.current++ });
    }, 2400 + rand(2600));
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {streams.map((s, i) => {
        // Static scatter under reduce-motion; otherwise fall from above the top
        // edge to below the bottom, looping.
        const translateY = reduceMotion
          ? 0
          : falls[i].interpolate({
              inputRange: [0, 1],
              outputRange: [-s.stripH, height + s.lineH],
            });
        return (
          <Animated.View
            key={i}
            style={[
              styles.stream,
              {
                left: s.x,
                top: reduceMotion ? Math.round(height * 0.1 * (i % 7)) : 0,
                transform: reduceMotion ? undefined : [{ translateY }],
              },
            ]}
          >
            {s.letters.map((ch, j) => (
              <Text
                key={j}
                style={[
                  styles.streamLetter,
                  {
                    fontSize: s.fontSize,
                    lineHeight: s.lineH,
                    // Leading (bottom) letter brightest, trailing letters ghost up.
                    opacity: reduceMotion ? 0.06 : 0.08 + 0.42 * (j / (s.letters.length - 1)),
                  },
                  j === s.letters.length - 1 && !reduceMotion && styles.streamHead,
                ]}
              >
                {ch}
              </Text>
            ))}
          </Animated.View>
        );
      })}

      {word && <RainWord key={word.key} text={word.text} width={width} height={height} onDone={onWordDone} />}
    </View>
  );
}

const styles = StyleSheet.create({
  stream: {
    position: 'absolute',
    alignItems: 'center',
  },
  streamLetter: {
    color: C.accent,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  // The leading glyph glows a touch brighter.
  streamHead: {
    color: C.accent,
    opacity: 0.85,
    textShadowColor: C.accentDim,
    textShadowRadius: 8,
  },
  wordRow: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  wordLetter: {
    color: C.accent,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 3,
    marginHorizontal: 1,
    textShadowColor: C.accentDim,
    textShadowRadius: 12,
  },
});
