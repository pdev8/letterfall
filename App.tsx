import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';

import GameScreen from './src/screens/GameScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { C } from './src/theme';

export default function App() {
  // No nav lib yet (two screens). GameScreen stays mounted so the in-progress
  // deal's state and timers are untouched; SettingsScreen overlays it.
  // Settings persistence is owned entirely by SettingsScreen.
  const [screen, setScreen] = useState<'game' | 'settings'>('game');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <GameScreen onOpenSettings={() => setScreen('settings')} />
      {screen === 'settings' && (
        <View style={StyleSheet.absoluteFill}>
          <SettingsScreen onClose={() => setScreen('game')} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
});
