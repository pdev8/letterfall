import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BigButton from '../components/BigButton';
import LetterRain from '../components/LetterRain';
import PopIn from '../components/PopIn';
import { useSettings } from '../settingsStore';
import { C } from '../theme';

/**
 * Landing screen (DB-145): choose Free Play or Daily. The Matrix-style letter
 * rain runs behind the menu; Daily lives here, not inside the play screen.
 */
export default function HomeScreen({
  onFreePlay,
  onDaily,
  onOpenSettings,
}: {
  onFreePlay: () => void;
  onDaily: () => void;
  onOpenSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useSettings().reduceMotion;

  return (
    <View style={styles.root}>
      <LetterRain reduceMotion={reduceMotion} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={onOpenSettings}
          hitSlop={8}
          accessibilityLabel="Settings"
          style={({ pressed }) => [styles.gear, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.gearGlyph}>{'⚙︎'}</Text>
        </Pressable>

        <View style={styles.hero}>
          <PopIn reduceMotion={reduceMotion}>
            <Text style={styles.wordmark}>DECKABET</Text>
          </PopIn>
          <Text style={styles.tagline}>Word Klondike</Text>
        </View>

        <View style={styles.menu}>
          <BigButton label="FREE PLAY" onPress={onFreePlay} />
          <View style={styles.menuGap} />
          <BigButton label="DAILY" kind="ghost" onPress={onDaily} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  gear: {
    position: 'absolute',
    right: 18,
    top: 14,
    padding: 6,
  },
  gearGlyph: {
    color: C.inkMuted,
    fontSize: 22,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 18,
  },
  wordmark: {
    color: C.ink,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowColor: C.accentFaint,
    textShadowRadius: 18,
  },
  tagline: {
    color: C.inkMuted,
    fontSize: 15,
    letterSpacing: 1.5,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  menu: {
    flex: 1,
    justifyContent: 'center',
  },
  menuGap: {
    height: 14,
  },
});
