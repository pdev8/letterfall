import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  clearGame,
  loadGame,
  loadHistory,
  loadMissedWords,
  loadStats,
  saveGame,
  saveHistory,
  saveMissedWords,
  saveStats,
} from '../appStorage';
import BigButton from '../components/BigButton';
import CardBack from '../components/CardBack';
import LetterCard from '../components/LetterCard';
import Overlay from '../components/Overlay';
import PopIn from '../components/PopIn';
import RerollPanel, { type RerollTop } from '../components/RerollPanel';
import WordChip from '../components/WordChip';
import { existsPlayableWord, isValidWord } from '../dict';
import { hapticFor, type FeedbackKind } from '../feedback';
import {
  dealToState,
  MAX_WORD,
  makeDealState,
  randomDealIndex,
  reducer,
  tableauCount,
} from '../game';
import { makeRecord, recordGame, type GameRecord, type HistoryState } from '../history';
import { recordMiss, type MissedWords } from '../missedWords';
import { dealScore, stockEconomyMult, wordEconomyMult, wordScore, type GameConfig } from '../scoring';
import { useSettings } from '../settingsStore';
import { recordDeal, type DealRecord, type LifetimeStats, type StatsMode } from '../stats';
import { C } from '../theme';
import type { Deal, TrayEntry } from '../types';

export default function GameScreen({
  // Optional with a no-op default so existing usage/tests don't break.
  onOpenSettings = () => {},
  // Free play: back to the home menu (PL-145).
  onBack,
  // Free play uses none of the daily props below; passing `deal` switches to
  // daily mode (PL-174) — a fixed deal, no redeal, recorded via onComplete/onExit.
  deal,
  config,
  statsMode = 'free',
  dailyLabel,
  onComplete,
  onExit,
}: {
  onOpenSettings?: () => void;
  /** Free play: return to the home menu. */
  onBack?: () => void;
  /** Daily mode: initialize the reducer from THIS deal instead of a random pool deal. */
  deal?: Deal;
  /** Difficulty knobs for the provided deal (daily uses rampFor(i).config). */
  config?: GameConfig;
  /** Which lifetime/history bucket this game records under. */
  statsMode?: StatsMode;
  /** Header label shown only in daily mode (e.g. "DAILY · GAME 3/5"). */
  dailyLabel?: string;
  /** Daily mode: fires once when the provided deal ends (win or dead deal). */
  onComplete?: (result: { won: boolean; score: number }) => void;
  /** Daily mode: leaves this game back to the daily screen. */
  onExit?: () => void;
} = {}) {
  // Daily mode is "a deal was provided". Free play never passes one, so every
  // daily-only branch below is dead code for the existing single-arg usage.
  const dailyMode = deal !== undefined;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets(); // clears the notch / Dynamic Island / home bar
  const settings = useSettings(); // live: haptics / sound / reduce-motion / config
  const reduceMotion = settings.reduceMotion;
  // Mirror for stable callbacks that fire haptics without re-subscribing.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Which stats bucket to record under; read from effects/callbacks via a ref
  // so their dependency arrays (and free-play behavior) are untouched.
  const statsModeRef = useRef(statsMode);
  statsModeRef.current = statsMode;
  // Fixed at mount: daily games never resume/persist as the free game (PL-122).
  const isDailyRef = useRef(dailyMode);

  const [state, dispatch] = useReducer(reducer, null, () =>
    deal !== undefined
      ? dealToState(deal, config)
      : makeDealState(randomDealIndex(), { won: 0, played: 0, streak: 0 }),
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Opening reroll (PL-178): a fresh deal starts by offering the swap panel;
  // Skip or the first real move dismisses it, a resumed mid-deal hides it, and
  // a redeal re-arms it.
  const [showReroll, setShowReroll] = useState(true);

  // Fire a haptic for a game event, honoring the toggle (PL-132). Sound joins
  // at PL-163. Wrapped in try/catch — haptics can throw on unsupported devices.
  const fire = useCallback((kind: FeedbackKind) => {
    const signal = hapticFor(kind, settingsRef.current.haptics);
    if (signal === null) return;
    try {
      if (signal === 'selection') void Haptics.selectionAsync();
      else if (signal === 'impact') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else if (signal === 'success')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // haptics unsupported on this device — ignore
    }
  }, []);

  // Animated values (transform/opacity only, native driver).
  const trayY = useRef(new Animated.Value(0)).current;
  const trayOpacity = useRef(new Animated.Value(1)).current;
  const stockShakeX = useRef(new Animated.Value(0)).current;
  const trayShakeX = useRef(new Animated.Value(0)).current;
  const foundationRef = useRef<ScrollView>(null);

  const runShake = useCallback(
    (v: Animated.Value) => {
      if (settingsRef.current.reduceMotion) return; // reduce motion: no shake
      v.setValue(0);
      Animated.sequence([
        Animated.timing(v, { toValue: 5, duration: 45, useNativeDriver: true }),
        Animated.timing(v, { toValue: -5, duration: 65, useNativeDriver: true }),
        Animated.timing(v, { toValue: 3, duration: 55, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 45, useNativeDriver: true }),
      ]).start();
    },
    [],
  );

  // ---------------- derived state
  const word = state.tray.map((e) => e.letter).join('');
  const wordValid = isValidWord(word);
  const tableauLeft = useMemo(() => tableauCount(state), [state]);
  const usableLetters = useMemo(() => {
    const letters: string[] = [];
    for (const col of state.columns) {
      if (col.length > 0) letters.push(col[col.length - 1].letter);
    }
    if (state.reserve.length > 0) letters.push(state.reserve[state.reserve.length - 1]);
    return letters;
  }, [state.columns, state.reserve]);
  const anyPlay = useMemo(() => existsPlayableWord(usableLetters), [usableLetters]);
  const canRecycle = state.stock.length === 0 && state.reserve.length > 0 && state.recyclesLeft > 0;
  const canDraw = state.stock.length > 0 || canRecycle;
  const reserveTop = state.reserve.length > 0 ? state.reserve[state.reserve.length - 1] : null;
  // Designated bays (PL-179): park only onto a marked column that's been cleared.
  const emptyBayOpen = state.bays.some((b) => state.columns[b]?.length === 0);
  const canPark = reserveTop !== null && !state.won && emptyBayOpen;
  // Parking with more reserve underneath exposes a fresh letter, so an open bay
  // can rescue an otherwise-stuck position.
  const parkRescue = state.reserve.length >= 2 && emptyBayOpen;
  const isDead = !state.won && tableauLeft > 0 && !anyPlay && !canDraw && !parkRescue;
  const showNoPlayHint = !state.won && !isDead && !anyPlay && tableauLeft > 0;
  const reserveInTray = state.tray.some((e) => e.source === 'reserve');
  const bestWord = state.played.reduce((a, b) => (b.length > a.length ? b : a), '');
  // Scored under this deal's own difficulty knobs (PL-131).
  const wonScore = state.won
    ? dealScore({
        words: state.played,
        reserveLettersPlayed: state.reserveLettersPlayed,
        parksUsed: state.parksUsed,
        recyclesUsed: state.recyclesUsed,
        config: state.config,
      })
    : 0;

  // ---------------- lifetime stats (PL-121)
  // Separate persisted layer over the reducer's session stats; surfaced in
  // PL-144's My Stats tab. Everything records under 'free' until challenge
  // mode (E5) exists.
  // When the current deal started; stamped on mount and on every redeal.
  const dealStartRef = useRef(0);
  // Difficulty knobs (PL-131) come from the live settings store; the next
  // deal reads settingsRef.current.config on redeal (never mid-deal).
  // null until loadStats resolves; outcomes finishing before then (never in
  // practice — a deal takes minutes) queue up and fold in on load.
  const lifetimeRef = useRef<LifetimeStats | null>(null);
  const pendingDealsRef = useRef<DealRecord[]>([]);

  const recordLifetimeDeal = useCallback((outcome: DealRecord) => {
    if (lifetimeRef.current === null) {
      pendingDealsRef.current.push(outcome);
      return;
    }
    lifetimeRef.current = recordDeal(lifetimeRef.current, statsModeRef.current, outcome);
    saveStats(lifetimeRef.current).catch(() => {}); // storage never crashes the game
  }, []);

  // ---------------- missed-word feedback loop (PL-203)
  // Same shape as the lifetime layer: null until loadMissedWords resolves;
  // misses attempted before then queue up and fold in on load. Local-only
  // until Supabase sync (PL-186).
  const missedRef = useRef<MissedWords | null>(null);
  const pendingMissesRef = useRef<string[]>([]);

  const recordMissedWord = useCallback((attempt: string) => {
    if (missedRef.current === null) {
      pendingMissesRef.current.push(attempt);
      return;
    }
    missedRef.current = recordMiss(missedRef.current, attempt);
    saveMissedWords(missedRef.current).catch(() => {}); // storage never crashes the game
  }, []);

  // ---------------- game history + personal bests (PL-123)
  // Same shape as the lifetime layer: null until loadHistory resolves;
  // records finishing before then queue up and fold in on load. Surfaced in
  // PL-144's history view — no UI here yet.
  const historyRef = useRef<HistoryState | null>(null);
  const pendingGamesRef = useRef<GameRecord[]>([]);

  const recordHistoryGame = useCallback((record: GameRecord) => {
    if (historyRef.current === null) {
      pendingGamesRef.current.push(record);
      return;
    }
    historyRef.current = recordGame(historyRef.current, record);
    saveHistory(historyRef.current).catch(() => {}); // storage never crashes the game
  }, []);

  useEffect(() => {
    dealStartRef.current = Date.now(); // the first deal's clock starts at mount
    loadStats().then((loaded) => {
      let s = loaded;
      for (const o of pendingDealsRef.current) s = recordDeal(s, statsModeRef.current, o);
      lifetimeRef.current = s;
      if (pendingDealsRef.current.length > 0) {
        pendingDealsRef.current = [];
        saveStats(s).catch(() => {});
      }
    });
    loadMissedWords().then((loaded) => {
      let m = loaded;
      for (const w of pendingMissesRef.current) m = recordMiss(m, w);
      missedRef.current = m;
      if (pendingMissesRef.current.length > 0) {
        pendingMissesRef.current = [];
        saveMissedWords(m).catch(() => {});
      }
    });
    loadHistory().then((loaded) => {
      let h = loaded;
      for (const r of pendingGamesRef.current) h = recordGame(h, r);
      historyRef.current = h;
      if (pendingGamesRef.current.length > 0) {
        pendingGamesRef.current = [];
        saveHistory(h).catch(() => {});
      }
    });
    // Resume a killed-mid-deal game (PL-122). The board may swap a few ms
    // after first paint — acceptable. Backdating the deal clock by the saved
    // elapsed time keeps PL-121's time-played honest across the relaunch.
    // A daily game is never the resumable free game, so it never restores.
    if (!isDailyRef.current) {
      loadGame()
        .then((saved) => {
          if (saved !== null) {
            dispatch({ type: 'restore', state: saved.state });
            dealStartRef.current = Date.now() - saved.elapsedMs;
            setShowReroll(false); // resumed mid-deal — the opening is long past
          }
        })
        .catch(() => {}); // storage never crashes the game
    }
  }, []);

  // Persist the in-progress deal on every change (PL-122). A restore dispatch
  // re-triggers this and re-saves the same state — harmless. Daily games are
  // never the resumable free game, so they never touch this slot.
  useEffect(() => {
    if (isDailyRef.current) return;
    if (state.won) {
      clearGame().catch(() => {}); // finished deals are never restored
    } else if (state.movesMade > 0 || state.tray.length > 0) {
      saveGame({ state, elapsedMs: Date.now() - dealStartRef.current }).catch(() => {});
    } else {
      clearGame().catch(() => {}); // fresh untouched deal: don't resurrect a stale save
    }
  }, [state]);

  // Record each win exactly once, on the false -> true transition.
  const prevWonRef = useRef(state.won);
  useEffect(() => {
    if (state.won && !prevWonRef.current) {
      fire('win'); // success haptic on the deal clearing
      const durationMs = Date.now() - dealStartRef.current;
      recordLifetimeDeal({
        won: true,
        durationMs,
        words: state.played,
        dealScore: wonScore,
      });
      recordHistoryGame(
        makeRecord({
          mode: statsModeRef.current,
          config: state.config,
          won: true,
          durationMs,
          words: state.played,
          dealScore: wonScore,
          at: Date.now(),
        }),
      );
    }
    prevWonRef.current = state.won;
  }, [state.won, state.played, state.config, wonScore, fire, recordLifetimeDeal, recordHistoryGame]);

  // ---------------- layout metrics
  const pad = 12;
  // Tableau wraps 4 columns per row (layout preview): fewer per row → bigger,
  // evenly-distributed cards, in two rows instead of one cramped row of seven.
  const colGap = 14;
  const colW = Math.floor((width - pad * 2 - 3 * colGap) / 4);
  const cardH = Math.round(colW * 1.34);
  // How much of each stacked face-down card peeks out below the one in front —
  // enough to show its rounded top corners so every hidden card reads as a full
  // card, not a flat stub. Kept below liftShift so a trayed top card still rises
  // clear of the stack.
  const cascadeReveal = Math.round(cardH * 0.18);
  // Piles stay compact — independent of the bigger tableau cards.
  const pileW = Math.floor((width - pad * 2 - 4 * 6) / 7) + 8;
  const pileH = Math.round(pileW * 1.3);
  const trayW = Math.floor((width - pad * 2 - 5 * 7) / MAX_WORD);
  const trayH = Math.round(trayW * 1.28);
  // Slot pitch in the space-between tray row, for the swap slide.
  const trayStep = trayW + (width - pad * 2 - trayW * MAX_WORD) / (MAX_WORD - 1);

  // ---------------- handlers
  const onStockTap = () => {
    if (busyRef.current) return;
    if (!canDraw) {
      runShake(stockShakeX); // inert stock: tiny shake
      return;
    }
    fire('tap');
    dispatch({ type: 'draw' });
  };

  const onTapColumn = (col: number) => {
    if (busyRef.current) return;
    const withdrawing = state.tray.some((e) => e.source === col);
    if (!withdrawing && state.tray.length >= MAX_WORD) {
      runShake(trayShakeX); // tray full
      return;
    }
    fire('tap');
    dispatch({ type: 'tapColumn', col });
  };

  const onTapReserve = () => {
    if (busyRef.current) return;
    const withdrawing = state.tray.some((e) => e.source === 'reserve');
    if (!withdrawing && state.tray.length >= MAX_WORD) {
      runShake(trayShakeX);
      return;
    }
    fire('tap');
    dispatch({ type: 'tapReserve' });
  };

  // ---------------- opening reroll (PL-178)
  const rerollTops: RerollTop[] = state.columns
    .map((col, i) => ({
      col: i,
      letter: col.length > 0 ? col[col.length - 1].letter : '',
      rerollable: col.length > 0 && !col[col.length - 1].fromStock,
    }))
    .filter((t) => t.letter !== '');

  const onRerollSwap = (cols: number[]) => {
    // A Heavy thunk as the selected cards drop to the bottom of the stock — the
    // 'play' Medium impact was too subtle to feel under the swap, so hit it
    // directly at full strength (the selection ticks already keep the engine warm).
    if (settingsRef.current.haptics) {
      try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch {
        // haptics unsupported on this device — ignore
      }
    }
    dispatch({ type: 'reroll', cols });
    setShowReroll(false); // one shot — commit the swap and reveal the new board
  };

  const onRerollSkip = () => {
    fire('tap');
    setShowReroll(false);
  };

  // ---------------- reserve drag (park onto an empty column)
  const stateRef = useRef(state);
  stateRef.current = state;
  // The pan responder is created once; route taps through a ref so it always
  // sees the current handler.
  const onTapReserveRef = useRef(onTapReserve);
  onTapReserveRef.current = onTapReserve;
  const [draggingReserve, setDraggingReserve] = useState(false);
  // Stays true through the spring-home animation so the card returns ON TOP,
  // matching the drag-out z-order (the pile drops its elevation only once the
  // card is fully settled).
  const [returningReserve, setReturningReserve] = useState(false);
  const draggingRef = useRef(false);
  const dragXY = useRef(new Animated.ValueXY()).current;
  // Hides the reserve card for the beat between committing a park and the next
  // queued card rendering, so the consumed card never flashes back at the pile.
  const reserveVisible = useRef(new Animated.Value(1)).current;
  const slotRefs = useRef<(View | null)[]>([]);
  const slotRects = useRef<{ col: number; x: number; y: number; w: number; h: number }[]>([]);

  const settleDrag = useCallback(
    (snap: boolean) => {
      draggingRef.current = false;
      setDraggingReserve(false);
      if (snap) {
        dragXY.setValue({ x: 0, y: 0 });
      } else {
        setReturningReserve(true);
        Animated.spring(dragXY, {
          toValue: { x: 0, y: 0 },
          friction: 6,
          useNativeDriver: false,
        }).start(() => setReturningReserve(false));
      }
    },
    [dragXY],
  );

  const reservePan = useRef(
    PanResponder.create({
      // Granted even while the reserve card is trayed: a tap then withdraws
      // it, and a drag parks it (parkReserve strips the tray entry itself).
      onStartShouldSetPanResponder: () => {
        const s = stateRef.current;
        return !busyRef.current && !s.won && s.reserve.length > 0;
      },
      onPanResponderGrant: () => {
        // Snapshot the park bays' screen rects for the drop hit-test.
        slotRects.current = [];
        slotRefs.current.forEach((ref, col) => {
          // Any empty column is a drop target while under the park cap (PL-177).
          ref?.measureInWindow((x, y, w, h) => {
            slotRects.current.push({ col, x, y, w, h });
          });
        });
      },
      onPanResponderMove: (_evt, gs) => {
        if (!draggingRef.current && (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4)) {
          draggingRef.current = true;
          setDraggingReserve(true);
        }
        dragXY.setValue({ x: gs.dx, y: gs.dy });
      },
      // Once we're dragging, never hand the touch to a card/slot Pressable the
      // finger passes over — that termination was springing the card home
      // mid-drag (scale 1.08 -> 1), which read as flicker/size-change.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderRelease: (_evt, gs) => {
        if (Math.abs(gs.dx) < 6 && Math.abs(gs.dy) < 6) {
          settleDrag(true);
          onTapReserveRef.current();
          return;
        }
        const pad = 8;
        const hit = slotRects.current.find(
          (r) =>
            gs.moveX >= r.x - pad &&
            gs.moveX <= r.x + r.w + pad &&
            gs.moveY >= r.y - pad &&
            gs.moveY <= r.y + r.h + pad,
        );
        if (hit) {
          // Hide the card being consumed the instant we commit, so it can't
          // flash at the reserve pile when dragXY snaps home before the next
          // card renders. Restore next frame — the queued card pops in cleanly.
          reserveVisible.setValue(0);
          dispatch({ type: 'parkReserve', col: hit.col });
          settleDrag(true); // parked: the next reserve card pops in at rest
          requestAnimationFrame(() => reserveVisible.setValue(1));
        } else {
          settleDrag(false); // no target: spring home
        }
      },
      onPanResponderTerminate: () => settleDrag(false),
    }),
  ).current;

  const onParkReserve = (col: number) => {
    if (busyRef.current) return;
    fire('tap');
    dispatch({ type: 'parkReserve', col });
  };

  // ---------------- tray drag-to-swap (a tap returns the card to its pile)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [displacedIdx, setDisplacedIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  const dragFromRef = useRef(0);
  const swapBusyRef = useRef(false);
  const dragTrayXY = useRef(new Animated.ValueXY()).current;
  const displacedX = useRef(new Animated.Value(0)).current;
  const trayRowRef = useRef<View>(null);
  const trayLeftRef = useRef(0);
  const trayGeomRef = useRef({ step: trayStep, w: trayW, len: 0 });
  trayGeomRef.current = { step: trayStep, w: trayW, len: state.tray.length };

  const onTrayLayout = () => {
    trayRowRef.current?.measureInWindow((x) => {
      trayLeftRef.current = x;
    });
  };

  const trayTargetFor = (dx: number) => {
    const { step, len } = trayGeomRef.current;
    const raw = Math.round((dragFromRef.current * step + dx) / step);
    return Math.max(0, Math.min(len - 1, raw));
  };

  const setHover = (h: number | null) => {
    if (hoverRef.current !== h) {
      hoverRef.current = h;
      setHoverIdx(h);
    }
  };

  const settleTrayDrag = useCallback(() => {
    Animated.spring(dragTrayXY, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      useNativeDriver: true,
    }).start(() => setDragIdx(null));
  }, [dragTrayXY]);

  const trayPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        if (busyRef.current || swapBusyRef.current) return false;
        const { step, w, len } = trayGeomRef.current;
        const x = evt.nativeEvent.pageX - trayLeftRef.current;
        const i = Math.floor(x / step);
        if (i < 0 || i >= len || x - i * step > w) return false; // gap or empty slot
        dragFromRef.current = i;
        return true;
      },
      onPanResponderGrant: () => {
        dragTrayXY.setValue({ x: 0, y: 0 });
        setDragIdx(dragFromRef.current);
      },
      onPanResponderMove: (_evt, gs) => {
        dragTrayXY.setValue({ x: gs.dx, y: gs.dy });
        const t = trayTargetFor(gs.dx);
        setHover(t !== dragFromRef.current ? t : null);
      },
      onPanResponderRelease: (_evt, gs) => {
        const from = dragFromRef.current;
        setHover(null);
        if (Math.abs(gs.dx) < 6 && Math.abs(gs.dy) < 6) {
          setDragIdx(null);
          dispatch({ type: 'tapTray', index: from }); // tap returns the card
          return;
        }
        const target = trayTargetFor(gs.dx);
        const { step } = trayGeomRef.current;
        if (target === from) {
          settleTrayDrag(); // no new slot: spring home
          return;
        }
        // Finish the slide into the target slot while the displaced card
        // crosses over, then commit the swap in one batched update.
        swapBusyRef.current = true;
        setDisplacedIdx(target);
        displacedX.setValue(0);
        Animated.parallel([
          Animated.timing(dragTrayXY, {
            toValue: { x: (target - from) * step, y: 0 },
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.timing(displacedX, {
            toValue: (from - target) * step,
            duration: 120,
            useNativeDriver: true,
          }),
        ]).start(() => {
          dispatch({ type: 'swapTray', a: from, b: target });
          setDragIdx(null);
          setDisplacedIdx(null);
          swapBusyRef.current = false;
        });
      },
      onPanResponderTerminate: () => {
        setHover(null);
        settleTrayDrag();
      },
    }),
  ).current;

  const onClear = () => {
    if (busyRef.current) return;
    dispatch({ type: 'clearTray' });
  };

  const onPlay = () => {
    if (busyRef.current) return;
    if (!wordValid) {
      // Rejected attempt: log playable-looking words so dictionary gaps
      // become data (PL-203), shake the tray as feedback, and stay put.
      if (state.tray.length >= 3) recordMissedWord(word);
      fire('invalid');
      runShake(trayShakeX);
      return;
    }
    fire('play');
    if (reduceMotion) {
      // Reduce motion: commit the play immediately, no fly-up.
      dispatch({ type: 'play' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    // Tray cards fly up toward the foundation, then the play commits.
    Animated.parallel([
      Animated.timing(trayY, { toValue: -64, duration: 260, useNativeDriver: true }),
      Animated.timing(trayOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      dispatch({ type: 'play' });
      trayY.setValue(0);
      trayOpacity.setValue(1);
      busyRef.current = false;
      setBusy(false);
    });
  };

  const onRedeal = () => {
    if (busyRef.current) return;
    // Abandoned deal: a lifetime loss, mirroring the reducer's own
    // counts-as-played rule. Words played so far still count (spec §5);
    // losses bank no points. Wins were already recorded by the win effect.
    if (!state.won && state.movesMade > 0) {
      const durationMs = Date.now() - dealStartRef.current;
      recordLifetimeDeal({
        won: false,
        durationMs,
        words: state.played,
        dealScore: 0,
      });
      recordHistoryGame(
        makeRecord({
          mode: statsModeRef.current,
          config: state.config,
          won: false,
          durationMs,
          words: state.played,
          dealScore: 0, // losses bank nothing
          at: Date.now(),
        }),
      );
    }
    // The new deal picks up the player's current knobs (PL-131).
    dispatch({ type: 'redeal', config: settingsRef.current.config });
    dealStartRef.current = Date.now(); // the new deal's clock starts now
    setShowReroll(true); // a fresh deal earns a fresh opening reroll
  };

  // Daily mode (PL-174): a game ends by banking its result and leaving to the
  // daily screen. No redeal — the seed is fixed. The lifetime/history layers
  // already recorded on the win transition (under 'challenge'); this hands the
  // outcome to the daily set so its progress/total advance.
  const onDailyContinue = (won: boolean, score: number) => {
    onComplete?.({ won, score });
    onExit?.();
  };

  const onShare = async () => {
    const message =
      `PUZZLEX ♠\n` +
      `${wonScore} pts · ${state.played.length} words · best: ${bestWord.toUpperCase()}\n` +
      `word klondike — every deal winnable`;
    try {
      await Share.share({ message });
    } catch {
      // sharing cancelled or unavailable — nothing to do
    }
  };

  // ---------------- render
  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 },
        ]}
      >
        {/* top bar — daily mode swaps the session stats + redeal for a back
            affordance and the game label (no reshuffling a fixed daily deal) */}
        {dailyMode ? (
          <View style={styles.topBar}>
            <Pressable
              onPress={() => onExit?.()}
              hitSlop={8}
              accessibilityLabel="Back to daily"
              style={({ pressed }) => [styles.redealBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <Text style={styles.wordmark}>{dailyLabel ?? 'DAILY'}</Text>
            <Pressable
              onPress={onOpenSettings}
              hitSlop={8}
              accessibilityLabel="Settings"
              style={({ pressed }) => [styles.redealBtn, pressed && { opacity: 0.6 }]}
            >
              {/* U+FE0E keeps the gear a text glyph, not an emoji */}
              <Text style={styles.redealGlyph}>{'⚙︎'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={8}
                  accessibilityLabel="Back to menu"
                  style={({ pressed }) => [styles.redealBtn, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.backGlyph}>‹</Text>
                </Pressable>
              ) : null}
              <Text style={styles.wordmark}>PUZZLEX</Text>
            </View>
            <View style={styles.topBarRight}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>
                  {state.stats.won}/{state.stats.played}
                </Text>
                <Text style={styles.statLabel}>won</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{state.stats.streak}</Text>
                <Text style={styles.statLabel}>streak</Text>
              </View>
              <Pressable
                onPress={onRedeal}
                hitSlop={8}
                accessibilityLabel="Redeal"
                style={({ pressed }) => [styles.redealBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.redealGlyph}>↻</Text>
              </Pressable>
              <Pressable
                onPress={onOpenSettings}
                hitSlop={8}
                accessibilityLabel="Settings"
                style={({ pressed }) => [styles.redealBtn, pressed && { opacity: 0.6 }]}
              >
                {/* U+FE0E keeps the gear a text glyph, not an emoji */}
                <Text style={styles.redealGlyph}>{'⚙︎'}</Text>
              </Pressable>
            </View>
          </View>
        )}
        {/* stock / reserve / foundation */}
        <View
          style={[
            styles.pilesRow,
            (draggingReserve || returningReserve) && styles.pilesRowDragging,
          ]}
        >
          <Animated.View style={{ transform: [{ translateX: stockShakeX }] }}>
            <Pressable onPress={onStockTap} style={({ pressed }) => pressed && canDraw ? { opacity: 0.8 } : null}>
              {state.stock.length > 0 ? (
                <CardBack width={pileW} height={pileH}>
                  <Text style={styles.stockCount}>{state.stock.length}</Text>
                </CardBack>
              ) : (
                <View style={[styles.emptyPile, { width: pileW, height: pileH }]}>
                  <Text style={[styles.recycleGlyph, canRecycle ? styles.recycleOn : styles.recycleOff]}>
                    {canRecycle ? '↻' : '·'}
                  </Text>
                </View>
              )}
            </Pressable>
            <View style={styles.pipsRow}>
              <View style={[styles.pip, state.recyclesLeft >= 1 && styles.pipOn]} />
              <View style={[styles.pip, state.recyclesLeft >= 2 && styles.pipOn]} />
            </View>
            <Text style={styles.pileCaption}>stock</Text>
          </Animated.View>

          <View
            style={[
              styles.reserveWrap,
              (draggingReserve || returningReserve) && styles.reserveOnTop,
            ]}
          >
            {/* The placemat always sits on the lowest layer; the card stacks on top.
                While dragging, this container is lifted above the "reserve" caption
                so the card never dips beneath it (or the stock / green cards). */}
            <View
              style={[
                { width: pileW, height: pileH },
                (draggingReserve || returningReserve) && styles.reserveOnTop,
              ]}
            >
              <View style={[styles.emptyPile, StyleSheet.absoluteFill]} />
              {reserveTop !== null && (
                <PopIn key={`${state.dealIndex}-r-${state.reserve.length}`} reduceMotion={reduceMotion}>
                  <Animated.View
                    {...reservePan.panHandlers}
                    style={{
                      marginTop: reserveInTray ? Math.round(pileH * 0.2) : 0,
                      opacity: reserveVisible,
                      transform: [
                        ...dragXY.getTranslateTransform(),
                        { scale: draggingReserve ? 1.08 : 1 },
                      ],
                    }}
                  >
                    <LetterCard
                      letter={reserveTop}
                      width={pileW}
                      height={pileH}
                      glow={!reserveInTray}
                      lifted={reserveInTray}
                      stock
                    />
                  </Animated.View>
                </PopIn>
              )}
            </View>
            <Text style={[styles.pileCaption, styles.reserveCaption]}>reserve</Text>
          </View>

          <Text style={styles.flowArrow}>→</Text>

          <View style={styles.foundationCol}>
            <ScrollView
              ref={foundationRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.foundationScroll}
              contentContainerStyle={styles.foundationContent}
              onContentSizeChange={() => foundationRef.current?.scrollToEnd({ animated: true })}
            >
              {state.played.length === 0 ? (
                <Text style={styles.foundationEmpty}>played words land here</Text>
              ) : (
                state.played.map((w, i) => <WordChip key={i} word={w} />)
              )}
            </ScrollView>
            <Text style={styles.tableauLeft}>tableau left: {tableauLeft}</Text>
          </View>
        </View>

        {/* tableau — wrapped 4 columns per row (layout preview): the 7 real
            columns plus a dashed placeholder 8th slot, laid out as a 2×4 grid.
            Park-bay markers (PL-179, ▾) sit above each row. */}
        {[
          [0, 1, 2, 3],
          [4, 5, 6, 7],
        ].map((rowIdx, r) => (
          <View key={r} style={r > 0 ? styles.boardRowGap : undefined}>
            <View style={styles.bayRow}>
              {rowIdx.map((i) => (
                <View key={i} style={{ width: colW, alignItems: 'center' }}>
                  {i < state.columns.length && state.bays.includes(i) ? (
                    <Text style={styles.bayMark}>▾</Text>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={styles.columnsRow}>
              {rowIdx.map((i) => {
                if (i >= state.columns.length) {
                  // Placeholder 8th slot — preview only, not a playable column.
                  return (
                    <View key={i} style={{ width: colW }}>
                      <View
                        style={[
                          styles.emptyColSlot,
                          styles.placeholderSlot,
                          { width: colW, height: cardH },
                        ]}
                      />
                    </View>
                  );
                }
                const col = state.columns[i];
                const inTray = state.tray.some((e) => e.source === i);
                const faceDown = Math.max(0, col.length - 1);
                const top = col.length > 0 ? col[col.length - 1] : null;
                // Lifted cards slide up out of the stack in layout (no transform,
                // so nothing clips). Every face-down card renders as a full card
                // back, cascaded so only its top edge (cascadeReveal) peeks out.
                const liftShift = Math.round(cardH * 0.2);
                const cascade = { marginTop: cascadeReveal - cardH };
                const isBay = state.bays.includes(i); // PL-179: park target column
                return (
                  <View key={i} style={{ width: colW }}>
                    {Array.from({ length: faceDown }, (_, j) => (
                      <View key={j} style={j > 0 ? cascade : undefined}>
                        <CardBack width={colW} height={cardH} />
                      </View>
                    ))}
                    {inTray && faceDown === 0 ? (
                      // Nothing beneath to reveal: a ghost spot marks the lifted
                      // card's home instead.
                      <View style={[styles.emptyColSlot, { width: colW, height: cardH }]} />
                    ) : null}
                    {top !== null ? (
                      <PopIn
                        key={`${state.dealIndex}-c${i}-${col.length}`}
                        style={
                          inTray
                            ? faceDown > 0
                              ? { marginTop: cascadeReveal - cardH + liftShift }
                              : { marginTop: liftShift - cardH }
                            : faceDown > 0
                              ? cascade
                              : undefined
                        }
                      >
                        <Pressable
                          disabled={busy}
                          onPress={() => onTapColumn(i)}
                          style={({ pressed }) => (pressed ? { opacity: 0.8 } : null)}
                        >
                          <LetterCard
                            letter={top.letter}
                            width={colW}
                            height={cardH}
                            glow={!inTray}
                            lifted={inTray}
                            stock={top.fromStock}
                          />
                        </Pressable>
                      </PopIn>
                    ) : isBay ? (
                      // Cleared bay: the only kind of empty column you can park on.
                      <Pressable
                        ref={(rf) => {
                          slotRefs.current[i] = rf;
                        }}
                        disabled={busy || !canPark}
                        onPress={() => onParkReserve(i)}
                        style={({ pressed }) => [
                          styles.emptyColSlot,
                          { width: colW, height: cardH },
                          draggingReserve && canPark && styles.emptyColSlotTarget,
                          pressed && canPark && { opacity: 0.6 },
                        ]}
                      >
                        {/* A cleared bay is marked by the plus alone. */}
                        <Text style={canPark ? styles.parkGlyph : styles.bayGlyph}>+</Text>
                      </Pressable>
                    ) : (
                      // Non-bay empty column: inert — never a park target.
                      <View style={[styles.emptyColSlot, { width: colW, height: cardH }]} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.hintRow}>
          {showNoPlayHint ? (
            <Text style={styles.hintText}>
              {canDraw ? 'no plays — draw' : 'no plays — park the reserve card'}
            </Text>
          ) : null}
        </View>

        <View style={styles.spacer} />

        {/* word tray */}
        <Animated.View
          ref={trayRowRef}
          onLayout={onTrayLayout}
          {...trayPan.panHandlers}
          style={[styles.trayRow, { transform: [{ translateX: trayShakeX }] }]}
        >
          {/* Ghost spots live on their own underlay so moving cards always
              pass over them, whatever their zIndex relative to each other. */}
          <View style={[StyleSheet.absoluteFill, styles.trayGhostRow]} pointerEvents="none">
            {Array.from({ length: MAX_WORD }, (_, i) => (
              <View key={`ghost-${i}`} style={[styles.traySlot, { width: trayW, height: trayH }]} />
            ))}
          </View>
          {Array.from({ length: MAX_WORD }, (_, i) => {
            const entry = state.tray[i] as TrayEntry | undefined;
            const isDragged = dragIdx === i;
            const isDisplaced = displacedIdx === i;
            const isHover = hoverIdx === i;
            // Compose one transform list: play-animation lift plus whichever
            // of drag / displaced-slide / hover-lift applies to this card.
            const transform: object[] = [{ translateY: trayY }];
            if (isDragged) {
              transform.push({ translateX: dragTrayXY.x }, { translateY: dragTrayXY.y });
            } else if (isDisplaced) {
              transform.push({ translateX: displacedX });
            } else if (isHover) {
              transform.push({ translateY: -5 }, { scale: 1.05 });
            }
            return (
              <View
                key={`pos-${i}`}
                style={[
                  { width: trayW, height: trayH },
                  isDragged && { zIndex: 12, elevation: 12 },
                  isDisplaced && { zIndex: 10, elevation: 10 },
                ]}
              >
                {entry ? (
                  <Animated.View style={{ opacity: trayOpacity, transform: transform as never }}>
                    <LetterCard
                      letter={entry.letter}
                      width={trayW}
                      height={trayH}
                      stock={entry.fromStock}
                    />
                  </Animated.View>
                ) : null}
              </View>
            );
          })}
        </Animated.View>

        {/* actions */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={onClear}
            disabled={busy || state.tray.length === 0}
            style={({ pressed }) => [
              styles.clearButton,
              state.tray.length === 0 && { opacity: 0.4 },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.clearButtonText}>CLEAR</Text>
          </Pressable>
          <Pressable
            onPress={onPlay}
            disabled={busy}
            style={({ pressed }) => [
              styles.playButton,
              wordValid ? styles.playButtonReady : styles.playButtonIdle,
              pressed && wordValid && { opacity: 0.85 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={wordValid ? styles.playTextReady : styles.playTextIdle}
            >
              {wordValid ? `PLAY ${word.toUpperCase()}` : word.length > 0 ? word.toUpperCase() : 'PLAY'}
            </Text>
            <Text style={[styles.playSub, wordValid && styles.playSubReady]}>
              {wordValid
                ? `${word.length} letters · +${wordScore(word)} pts`
                : word.length === 0
                  ? 'tap cards to spell'
                  : word.length < 3
                    ? 'too short'
                    : 'not a word'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* win overlay */}
      {showReroll &&
        !state.won &&
        state.movesMade === 0 &&
        state.reserve.length === 0 &&
        state.played.length === 0 && (
          <RerollPanel
            tops={rerollTops}
            onSwap={onRerollSwap}
            onSkip={onRerollSkip}
            onToggle={() => fire('tap')}
            reduceMotion={reduceMotion}
          />
        )}

      {state.won && (
        <Overlay reduceMotion={reduceMotion}>
          <Text style={styles.overlayTitle}>TABLEAU CLEARED</Text>
          <View style={styles.overlayRule} />
          <View style={styles.wonWordsWrap}>
            {state.played.map((w, i) => (
              <PopIn key={i} delay={i * 80} reduceMotion={reduceMotion}>
                <WordChip word={w} pts={wordScore(w)} />
              </PopIn>
            ))}
          </View>
          {(() => {
            // Presented as named bonuses only — players never see the math (spec 4c).
            const econ = wordEconomyMult(state.played.length);
            const stock = stockEconomyMult(
              state.reserveLettersPlayed,
              state.parksUsed,
              state.recyclesUsed,
            );
            const pct = (m: number) => `+${Math.round((m - 1) * 100)}%`;
            const chips: string[] = [];
            const closer = state.played[state.played.length - 1] ?? '';
            chips.push(`ENCORE ×2 · ${closer.toUpperCase()}`);
            if (econ > 1) chips.push(`WORD ECONOMY ${pct(econ)}`);
            if (stock === 1.5) chips.push('PURIST ★ +50%');
            else if (stock > 1) chips.push(`STOCK DISCIPLINE ${pct(stock)}`);
            const baseDelay = state.played.length * 80 + 120;
            return (
              <>
                <View style={styles.bonusWrap}>
                  {chips.map((label, i) => (
                    <PopIn key={label} delay={baseDelay + i * 140} reduceMotion={reduceMotion}>
                      <View style={styles.bonusChip}>
                        <Text style={styles.bonusChipText}>{label}</Text>
                      </View>
                    </PopIn>
                  ))}
                </View>
                <PopIn delay={baseDelay + chips.length * 140 + 120} reduceMotion={reduceMotion}>
                  <Text style={styles.scoreTotal}>{wonScore}</Text>
                  <Text style={styles.scoreTotalLabel}>points</Text>
                </PopIn>
              </>
            );
          })()}
          <Text style={styles.overlayStat}>
            {state.played.length} words · best {bestWord.toUpperCase()}
          </Text>
          {dailyMode ? (
            <>
              <BigButton label="CONTINUE" onPress={() => onDailyContinue(true, wonScore)} />
              <BigButton label="SHARE" kind="ghost" onPress={onShare} />
            </>
          ) : (
            <>
              <BigButton label="SHARE" onPress={onShare} />
              <BigButton label="NEXT DEAL" kind="ghost" onPress={onRedeal} />
            </>
          )}
        </Overlay>
      )}

      {/* dead deal overlay */}
      {isDead && (
        <Overlay reduceMotion={reduceMotion}>
          <Text style={styles.overlayTitle}>DEAD DEAL</Text>
          <View style={styles.overlayRule} />
          <Text style={styles.overlayBody}>
            {dailyMode
              ? 'The line ran out — no word left in these letters. This daily game is done; your other games are still waiting.'
              : 'The shuffle got you — no word left in these letters. This line ran out; the next deal is a fresh one, and every deal has a winning path.'}
          </Text>
          {dailyMode ? (
            <BigButton label="CONTINUE" onPress={() => onDailyContinue(false, 0)} />
          ) : (
            <BigButton label="REDEAL" onPress={onRedeal} />
          )}
        </Overlay>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- styles

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 12,
    // vertical padding is applied inline with safe-area insets
  },

  // top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wordmark: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statBlock: {
    alignItems: 'center',
  },
  statValue: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: C.inkFaint,
    fontSize: 9,
    letterSpacing: 1,
  },
  redealBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redealGlyph: {
    color: C.ink,
    fontSize: 18,
    lineHeight: 22,
  },
  // Back chevron for the daily-mode top bar (mirrors SettingsScreen).
  backGlyph: {
    color: C.ink,
    fontSize: 24,
    lineHeight: 26,
    marginTop: -2,
  },
  // DAILY entry pill, sits left of the gear in free play.
  // stock / reserve / foundation row
  pilesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
  },
  pilesRowDragging: {
    zIndex: 50,
    elevation: 50,
  },
  // The dragged reserve card sits above its own caption, the stock, and the
  // tableau — a stable top z-order so it never flickers under overlapping cards.
  reserveOnTop: {
    zIndex: 60,
    elevation: 60,
  },
  stockCount: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    color: C.inkMuted,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
  },
  pip: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.inkFaint,
  },
  pipOn: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  pileCaption: {
    color: C.inkFaint,
    fontSize: 9,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 3,
  },
  reserveWrap: {
    alignItems: 'center',
  },
  // Matches the stock caption's offset (pips row: 6 margin + 6 height, +3).
  reserveCaption: {
    marginTop: 15,
  },
  emptyPile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recycleGlyph: {
    fontSize: 22,
  },
  recycleOn: {
    color: C.accent,
  },
  recycleOff: {
    color: C.inkFaint,
  },
  flowArrow: {
    color: C.inkFaint,
    fontSize: 14,
    alignSelf: 'center',
    marginTop: -14,
  },
  foundationCol: {
    flex: 1,
    justifyContent: 'center',
  },
  foundationScroll: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
    flexGrow: 0,
  },
  foundationContent: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  foundationEmpty: {
    color: C.inkFaint,
    fontSize: 11,
    fontStyle: 'italic',
  },
  tableauLeft: {
    color: C.inkMuted,
    fontSize: 11,
    marginTop: 5,
    marginLeft: 2,
    fontVariant: ['tabular-nums'],
  },

  // tableau
  // Park-bay markers (PL-179), aligned to the columns below them.
  bayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: -6,
  },
  bayMark: {
    color: C.stock,
    fontSize: 13,
    lineHeight: 13,
    fontWeight: '900',
  },
  columnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  // Vertical gap between the two wrapped board rows.
  boardRowGap: {
    marginTop: 18,
  },
  // Ghost spot: same treatment as the tray slots, no accent outline.
  emptyColSlot: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The preview-only 8th slot: dashed + faint so it reads as "not real yet".
  placeholderSlot: {
    borderStyle: 'dashed',
    borderColor: C.borderSoft,
    backgroundColor: 'transparent',
    opacity: 0.45,
  },
  emptyColSlotTarget: {
    backgroundColor: C.stockFaint,
  },
  parkGlyph: {
    color: C.stock,
    fontSize: 20,
    fontWeight: '300',
  },
  bayGlyph: {
    color: C.stockDim,
    fontSize: 20,
    fontWeight: '300',
  },

  // hint
  hintRow: {
    height: 20,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: C.accent,
    fontSize: 12,
    letterSpacing: 1,
  },
  spacer: {
    flex: 1,
  },

  // tray
  trayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  trayGhostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  traySlot: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.borderSoft,
    backgroundColor: C.surface,
  },

  // actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  clearButton: {
    width: 76,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: C.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  playButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  playButtonIdle: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  playButtonReady: {
    backgroundColor: C.accent,
  },
  playTextIdle: {
    color: C.inkMuted,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
  },
  playTextReady: {
    color: '#0c2417',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
  },
  playSub: {
    color: C.inkFaint,
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  playSubReady: {
    color: 'rgba(12,36,23,0.65)',
  },

  // overlays
  overlayTitle: {
    color: C.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
  },
  overlayRule: {
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.accent,
    marginTop: 10,
    marginBottom: 14,
  },
  overlayBody: {
    color: C.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
  },
  wonWordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  bonusWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  bonusChip: {
    borderRadius: 999,
    backgroundColor: C.accentFaint,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bonusChipText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  scoreTotal: {
    color: C.ink,
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  scoreTotalLabel: {
    color: C.inkFaint,
    fontSize: 10,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  overlayStat: {
    color: C.inkMuted,
    fontSize: 13,
    marginBottom: 18,
  },
});
