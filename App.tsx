import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadDailySet, saveDailySet } from './src/appStorage';
import { dailyDeal, recordDailyGame, type DailySet } from './src/daily';
import { DAILY_GAME_COUNT, rampFor } from './src/dailyRamp';
import DailyScreen from './src/screens/DailyScreen';
import GameScreen from './src/screens/GameScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { C } from './src/theme';

export default function App() {
  // No nav lib yet. GameScreen (free play) stays mounted so the in-progress
  // deal's state and timers are untouched; the other screens overlay it. Each
  // screen applies its own safe-area insets (via SafeAreaProvider), so an
  // overlay's controls clear the notch / Dynamic Island.
  //
  // Two independent layers:
  //  - `screen` picks the base surface: free play or the daily lobby.
  //  - `showSettings` overlays settings above whatever is showing, without
  //    disturbing the daily context underneath.
  const [screen, setScreen] = useState<'game' | 'daily'>('game');
  const [showSettings, setShowSettings] = useState(false);
  // Daily mode (DB-174): App owns the set (single source of truth) so a
  // finished game's progress/total show instantly on return — no reload race.
  const [dailySet, setDailySet] = useState<DailySet | null>(null);
  // The daily game currently being played (index into the set), or null.
  const [dailyIndex, setDailyIndex] = useState<number | null>(null);

  const openDaily = () => {
    setScreen('daily');
    // Load (or reset for a new play day) the set, then show it.
    loadDailySet(Date.now())
      .then(setDailySet)
      .catch(() => {});
  };

  const onCompleteDaily = (result: { won: boolean; score: number }) => {
    if (dailySet === null || dailyIndex === null) return;
    const next = recordDailyGame(dailySet, dailyIndex, result);
    setDailySet(next);
    saveDailySet(next).catch(() => {}); // storage never crashes the game
  };

  const playingDaily =
    dailyIndex !== null &&
    dailySet !== null &&
    dailyIndex >= 0 &&
    dailyIndex < DAILY_GAME_COUNT;

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <GameScreen
          onOpenSettings={() => setShowSettings(true)}
          onOpenDaily={openDaily}
        />
        {screen === 'daily' && (
          <View style={StyleSheet.absoluteFill}>
            <DailyScreen
              set={dailySet}
              onClose={() => setScreen('game')}
              onPlayGame={setDailyIndex}
            />
          </View>
        )}
        {playingDaily && (
          // Opaque overlay above the daily lobby; keyed by index so each game
          // remounts the reducer with its own deal.
          <View style={[StyleSheet.absoluteFill, styles.root]}>
            <GameScreen
              key={dailyIndex}
              deal={dailyDeal(dailySet, dailyIndex)}
              config={rampFor(dailyIndex).config}
              statsMode="challenge"
              dailyLabel={`DAILY · GAME ${dailyIndex + 1}/${DAILY_GAME_COUNT}`}
              onOpenSettings={() => setShowSettings(true)}
              onComplete={onCompleteDaily}
              onExit={() => setDailyIndex(null)}
            />
          </View>
        )}
        {/* Settings sits on the very top so it overlays free play, the daily
            lobby, or a daily game without changing the surface underneath. */}
        {showSettings && (
          <View style={StyleSheet.absoluteFill}>
            <SettingsScreen onClose={() => setShowSettings(false)} />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
});
