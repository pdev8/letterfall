import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BigButton from '../components/BigButton';
import HangingCards from '../components/HangingCards';
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
      <HangingCards reduceMotion={reduceMotion} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={onOpenSettings}
          hitSlop={8}
          accessibilityLabel="Settings"
          style={({ pressed }) => [styles.gear, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.gearGlyph}>{'⚙︎'}</Text>
        </Pressable>

        {/* No title text — the hanging cards spell DECKABET. This spacer keeps
            the menu where it was. */}
        <View style={styles.hero} />

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
  },
  menu: {
    flex: 1,
    justifyContent: 'center',
  },
  menuGap: {
    height: 14,
  },
});
