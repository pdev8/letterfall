import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { configMult, type GameConfig } from '../scoring';
import type { Settings } from '../settings';
import { updateSettings, useSettings } from '../settingsStore';
import { C } from '../theme';

// Placeholder until a real version source (expo-constants) lands with release
// tooling; keep in sync with app.json.
const APP_VERSION = 'v1.0.0';

/** Equation-free bonus label for a config (spec §4c): "+20%" or "standard". */
function bonusLabel(config: GameConfig): string {
  const pct = Math.round((configMult(config) - 1) * 100);
  return pct === 0 ? 'standard scoring' : `score bonus +${pct}%`;
}

/**
 * Settings (DB-130 scaffold, DB-131 difficulty knobs). Owns its own
 * persistence: loads on mount, saves fire-and-forget on every change.
 * Difficulty is two knobs — recycles and park bays — that harden the game
 * and raise the score bonus; they apply from the next deal. Toggles are
 * consumed by DB-132; the rulebook row activates with DB-133.
 */
export default function SettingsScreen({ onClose }: { onClose: () => void }) {
  // Live from the shared store — changes take effect in the game immediately.
  const settings: Settings = useSettings();

  const update = (patch: Partial<Settings>) => updateSettings({ ...settings, ...patch });

  const knobRow = (label: string, key: 'recycles' | 'parkBays', options: number[]) => (
      <View style={styles.segmentRow}>
        {options.map((v) => {
          const selected = settings.config[key] === v;
          return (
            <Pressable
              key={v}
              accessibilityLabel={`${label} ${v}`}
              onPress={() => update({ config: { ...settings.config, [key]: v } })}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.segmentSelected,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
    );

  const toggleRow = (label: string, key: 'haptics' | 'sound' | 'reduceMotion') => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={settings[key]}
        onValueChange={(v) => update({ [key]: v })}
        trackColor={{ false: C.border, true: C.accentDim }}
        thumbColor={settings[key] ? C.accent : C.inkMuted}
        ios_backgroundColor={C.border}
      />
    </View>
  );

  return (
    <View style={styles.root}>
      {/* top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.wordmark}>SETTINGS</Text>
        <View style={styles.backBtnBalance} />
      </View>

      {/* difficulty knobs (DB-131): harder config → bigger score bonus */}
      <View style={styles.knobHead}>
        <Text style={styles.sectionLabel}>DIFFICULTY</Text>
        <Text style={styles.bonusTag}>{bonusLabel(settings.config)}</Text>
      </View>
      <Text style={styles.knobLabel}>Recycles</Text>
      {knobRow('Recycles', 'recycles', [0, 1, 2])}
      <Text style={styles.knobLabel}>Park bays</Text>
      {knobRow('Park bays', 'parkBays', [1, 2, 3])}
      <Text style={styles.caption}>
        fewer recycles and bays = harder, worth more — applies from your next deal
      </Text>

      {/* feedback toggles (DB-132) */}
      <Text style={styles.sectionLabel}>FEEDBACK</Text>
      {toggleRow('Haptics', 'haptics')}
      {toggleRow('Sound', 'sound')}
      {toggleRow('Reduce motion', 'reduceMotion')}

      {/* footer */}
      <View style={styles.footer}>
        <View style={[styles.row, styles.rowDisabled]}>
          <Text style={styles.rowLabel}>Rulebook</Text>
          <Text style={styles.comingSoon}>coming soon</Text>
        </View>
        <Text style={styles.version}>DECKABET {APP_VERSION}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },

  // top bar — mirrors GameScreen's bar so the screens read as one room
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    color: C.ink,
    fontSize: 24,
    lineHeight: 26,
    marginTop: -2,
  },
  backBtnBalance: {
    width: 40, // keeps the wordmark optically centered
  },

  sectionLabel: {
    color: C.inkFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 8,
  },

  // difficulty knobs
  knobHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  bonusTag: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  knobLabel: {
    color: C.inkMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    borderColor: C.accentDim,
    backgroundColor: C.accentFaint,
  },
  segmentText: {
    color: C.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  segmentTextSelected: {
    color: C.accent,
  },
  caption: {
    color: C.inkFaint,
    fontSize: 11,
    marginTop: 8,
  },

  // toggle rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 8,
  },
  rowLabel: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  rowDisabled: {
    opacity: 0.5,
  },
  comingSoon: {
    color: C.inkFaint,
    fontSize: 11,
    letterSpacing: 1,
  },

  // footer
  footer: {
    marginTop: 'auto',
  },
  version: {
    color: C.inkFaint,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 10,
  },
});
