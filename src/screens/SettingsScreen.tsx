import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { loadSettings, saveSettings } from '../appStorage';
import type { Difficulty } from '../scoring';
import { DIFFICULTIES, type Settings } from '../settings';
import { C } from '../theme';

const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  casual: 'Casual',
  standard: 'Standard',
  expert: 'Expert',
};

// Placeholder until a real version source (expo-constants) lands with release
// tooling; keep in sync with app.json.
const APP_VERSION = 'v1.0.0';

/**
 * Settings scaffold (DB-130). Owns its own persistence: loads on mount,
 * saves fire-and-forget on every change. App.tsx only mounts/unmounts it.
 * Difficulty wires into game config with DB-131; toggles are consumed by
 * DB-132; the rulebook row activates with DB-133.
 */
export default function SettingsScreen({ onClose }: { onClose: () => void }) {
  // null until loadSettings resolves — rows render once real values exist so
  // the controls never flash defaults over a different saved state.
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      if (prev === null) return prev;
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {}); // storage never crashes the game
      return next;
    });
  };

  const toggleRow = (label: string, key: 'haptics' | 'sound' | 'reduceMotion') =>
    settings === null ? null : (
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

      {settings !== null && (
        <>
          {/* difficulty (persisted now; game config wiring is DB-131) */}
          <Text style={styles.sectionLabel}>DIFFICULTY</Text>
          <View style={styles.segmentRow}>
            {DIFFICULTIES.map((d) => {
              const selected = settings.difficulty === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => update({ difficulty: d })}
                  style={({ pressed }) => [
                    styles.segment,
                    selected && styles.segmentSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                    {DIFFICULTY_LABEL[d]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.caption}>applies from your next deal — full rules land soon</Text>

          {/* toggles (persisted now; consumed by DB-132) */}
          <Text style={styles.sectionLabel}>FEEDBACK</Text>
          {toggleRow('Haptics', 'haptics')}
          {toggleRow('Sound', 'sound')}
          {toggleRow('Reduce motion', 'reduceMotion')}
        </>
      )}

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

  // difficulty segments
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
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
