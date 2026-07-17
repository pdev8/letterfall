// Daily Challenge screen (DB-174) — the front door to the ranked five-game
// set. Pure view over the DailySet: it shows the cumulative total, per-game
// progress, and the reset countdown, and hands PLAY taps up to App (which owns
// the set, builds the deal, and banks each result). Styled as the same
// card-room as SettingsScreen so the screens read as one place.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  dailyProgress,
  dailyTotal,
  isDailyComplete,
  msUntilNextDay,
  nextDailyGame,
  type DailySet,
} from '../daily';
import { DAILY_GAME_COUNT, rampFor } from '../dailyRamp';
import { C } from '../theme';

/** Human-readable difficulty descriptor for daily game `i` (from its ramp). */
function rampLabel(i: number): string {
  const { generosity } = rampFor(i);
  if (generosity >= 1) return 'flat board · kind steer';
  if (generosity >= 0.75) return 'gentle slope';
  if (generosity >= 0.5) return 'steady climb';
  if (generosity >= 0.25) return 'steep · lean steer';
  return 'summit · no steer';
}

/** "Rx · By" knob note for daily game `i`. */
function knobNote(i: number): string {
  const { config } = rampFor(i);
  return `${config.recycles} recycle${config.recycles === 1 ? '' : 's'} · ${config.parkBays} bay${
    config.parkBays === 1 ? '' : 's'
  }`;
}

/** ms → "Hh Mm" (floored). Rendered on mount/refresh; not a live ticker. */
function fmtCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export default function DailyScreen({
  set,
  onClose,
  onPlayGame,
}: {
  /** Authoritative set from App (owner). Null only during the brief initial load. */
  set: DailySet | null;
  onClose: () => void;
  onPlayGame: (index: number) => void;
}) {
  const insets = useSafeAreaInsets(); // back button must clear the notch / Island

  const complete = set !== null && isDailyComplete(set);
  const nextIdx = set !== null ? nextDailyGame(set) : -1;
  const total = set !== null ? dailyTotal(set) : 0;
  const played = set !== null ? dailyProgress(set) : 0;
  const untilNext = fmtCountdown(msUntilNextDay(Date.now()));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
      {/* top bar — mirrors GameScreen / SettingsScreen */}
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.wordmark}>DAILY ♠</Text>
        <View style={styles.backBtnBalance} />
      </View>

      {set === null ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>loading the daily set…</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* header: cumulative total + progress */}
          <View style={styles.headerCard}>
            <Text style={styles.totalValue}>{total}</Text>
            <Text style={styles.totalLabel}>DAILY TOTAL</Text>
            <View style={styles.progressPips}>
              {Array.from({ length: DAILY_GAME_COUNT }, (_, i) => (
                <View
                  key={i}
                  style={[styles.progressPip, i < played && styles.progressPipOn]}
                />
              ))}
            </View>
            <Text style={styles.progressText}>
              {played} / {DAILY_GAME_COUNT} played
            </Text>
          </View>

          {complete ? (
            <View style={styles.doneBanner}>
              <Text style={styles.doneTitle}>ALL FIVE PLAYED</Text>
              <Text style={styles.doneBody}>
                Come back tomorrow for a fresh set. Today you banked {total} points.
              </Text>
            </View>
          ) : null}

          {/* five game rows */}
          {set.games.map((g, i) => {
            const isDone = g.played;
            const isCurrent = !complete && i === nextIdx;
            const isLocked = !isDone && !isCurrent;
            return (
              <View
                key={i}
                style={[
                  styles.gameRow,
                  isCurrent && styles.gameRowCurrent,
                  isLocked && styles.gameRowLocked,
                ]}
              >
                <View style={styles.gameNum}>
                  <Text style={styles.gameNumText}>{i + 1}</Text>
                </View>
                <View style={styles.gameMid}>
                  <Text style={styles.gameLabel}>{rampLabel(i)}</Text>
                  <Text style={styles.gameKnobs}>{knobNote(i)}</Text>
                </View>
                <View style={styles.gameRight}>
                  {isDone ? (
                    <View style={styles.doneStat}>
                      <Text style={[styles.doneMark, g.won ? styles.doneWin : styles.doneLoss]}>
                        {g.won ? '✓' : '✗'}
                      </Text>
                      <Text style={styles.doneScore}>{g.score}</Text>
                    </View>
                  ) : isCurrent ? (
                    <Pressable
                      onPress={() => onPlayGame(i)}
                      hitSlop={6}
                      accessibilityLabel={`Play game ${i + 1}`}
                      style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={styles.playBtnText}>PLAY</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.lockGlyph}>🔒</Text>
                  )}
                </View>
              </View>
            );
          })}

          {/* reset countdown */}
          <Text style={styles.countdown}>next set in {untilNext}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 12,
    // vertical padding is applied inline with safe-area insets
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

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: C.inkFaint,
    fontSize: 13,
    fontStyle: 'italic',
  },

  scrollContent: {
    paddingTop: 20,
    paddingBottom: 24,
  },

  // header total card
  headerCard: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
    paddingVertical: 18,
    marginBottom: 18,
  },
  totalValue: {
    color: C.ink,
    fontSize: 44,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  totalLabel: {
    color: C.inkFaint,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 2,
  },
  progressPips: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
  progressPip: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.inkFaint,
    backgroundColor: 'transparent',
  },
  progressPipOn: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  progressText: {
    color: C.inkMuted,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 8,
  },

  // completed banner
  doneBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accentDim,
    backgroundColor: C.accentFaint,
    padding: 14,
    marginBottom: 16,
  },
  doneTitle: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 6,
  },
  doneBody: {
    color: C.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },

  // game rows
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  gameRowCurrent: {
    borderColor: C.accentDim,
    backgroundColor: C.surfaceHi,
  },
  gameRowLocked: {
    opacity: 0.45,
  },
  gameNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  gameNumText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  gameMid: {
    flex: 1,
  },
  gameLabel: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  gameKnobs: {
    color: C.inkFaint,
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  gameRight: {
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 66,
  },
  playBtn: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: {
    color: '#0c2417',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  doneStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  doneMark: {
    fontSize: 16,
    fontWeight: '800',
  },
  doneWin: {
    color: C.accent,
  },
  doneLoss: {
    color: C.inkFaint,
  },
  doneScore: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  lockGlyph: {
    fontSize: 14,
    opacity: 0.8,
  },

  countdown: {
    color: C.inkFaint,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 14,
  },
});
