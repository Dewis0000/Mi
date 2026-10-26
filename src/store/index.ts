import { create } from 'zustand';
import type {
  AiBudget,
  AiProviderId,
  AiState,
  BirthMode,
  CauseOfDeath,
  Character,
  Choice,
  Country,
  EventDefinition,
  GamePhase,
  GameSpeed,
  LifeEvent,
  Region,
  SessionConfig,
  SessionLength,
} from '../types';
import type { Locale } from '../i18n';
import { generateCharacter } from '../engine/birth';
import {
  createClockState,
  recalibratePace,
  secondsForYear,
  setPaused,
  setSpeed,
  shouldEnterAcceleratedRemainder,
} from '../engine/clock';
import { resolvePendingChoice, runYearTick } from '../engine/tick';
import { createRng, type RngFn } from '../engine/rng';
import { getCountry, getRegion } from '../data';
import { allEvents } from '../events';
import { randomSeed } from '../lib/seed';
import { buildOfflineLifeEvent } from './textResolution';
import { addLifeLogEntry } from './journalDb';
import { readLocal, writeLocal } from './persist';
import { resolveChoiceLabels, resolveEpilogue, resolveEventText } from './aiOrchestration';
import { clearKey, getKey, setKey as persistAiKey, setBaseUrl as persistAiBaseUrl } from './aiKeyHolder';

const LOCALE_KEY = 'oob.ui.locale';
const ACK_WARNING_KEY = 'oob.ui.ackWarning';
const SPEED_KEY = 'oob.ui.speed';
const AUTOSAVE_KEY = 'oob.autosave';
const AUTOSAVE_INTERVAL_MS = 30_000;
const DEGRADE_AFTER_CONSECUTIVE_FAILURES = 2;

export interface SetupDraft {
  length: SessionLength;
  birthMode: BirthMode;
  countryIso3?: string;
  regionId?: string;
  seed?: string;
}

interface AutosaveSnapshot {
  character: Character;
  countryIso3: string;
  regionId: string | null;
  timeline: LifeEvent[];
  statsHistory: StoreState['statsHistory'];
  session: SessionConfig;
  firedOnceIds: string[];
  savedAt: number;
}

export interface StoreState {
  locale: Locale;
  ackWarning: boolean;
  preferredSpeed: GameSpeed;

  phase: GamePhase;
  character: Character | null;
  country: Country | null;
  region: Region | null;
  timeline: LifeEvent[];
  statsHistory: Array<{ age: number; health: number; wealth: number; education: number; bonds: number; standing: number }>;
  clock: ReturnType<typeof createClockState> | null;
  rarity: import('../types').RarityReport | null;
  session: SessionConfig | null;
  setupDraft: SetupDraft;
  pendingChoice: { def: EventDefinition; choices: Choice[]; title: string; body: string; source: 'ai' | 'offline'; openedAt: number } | null;
  resolvedChoiceLabels: Record<string, string> | null;
  causeOfDeath: CauseOfDeath | null;
  epilogueText: string | null;
  sessionStartedAt: number | null;
  resumePromptAvailable: boolean;
  lastAutosaveAt: number;
  awaitingText: boolean;
  aiConsecutiveFailures: number;

  ai: AiState;

  rng: RngFn | null;
  firedOnceIds: Set<string>;

  setLocale: (l: Locale) => void;
  acknowledgeWarning: () => void;
  updateSetupDraft: (partial: Partial<SetupDraft>) => void;
  goToMenu: () => void;
  goToSetup: () => void;
  goToJournal: () => void;
  goToAiSetup: () => void;
  startNewLife: () => void;
  confirmBirthAndLive: () => void;
  tickClock: (deltaMs: number) => void;
  resolveChoice: (choiceId: string | null, resolvedBy: 'player' | 'timeout') => void;
  setSpeedPreference: (speed: GameSpeed) => void;
  togglePause: () => void;
  quitAndForget: () => void;
  continueToEpilogue: () => void;
  liveAnotherOne: () => void;
  liveSameSeed: () => void;
  checkAutosave: () => void;
  resumeAutosave: () => void;
  discardAutosave: () => void;

  setAiProvider: (provider: AiProviderId | null) => void;
  setAiKey: (key: string, remember: boolean) => void;
  clearAiKey: () => void;
  setAiBaseUrl: (url: string) => void;
  setAiModel: (model: string | null) => void;
  setAiVerified: (verified: boolean, label?: string) => void;
  setAiBudget: (budget: Partial<AiBudget>) => void;
  toggleDescribeAll: () => void;
  dismissDegraded: () => void;
}

function defaultAiState(): AiState {
  return {
    provider: null,
    apiKeyPresent: !!getKey(),
    rememberKey: true,
    model: null,
    verified: false,
    describeAllViaAi: false,
    budget: { limitUsd: 1, scope: 'all-time', spentUsd: 0, spentTokensIn: 0, spentTokensOut: 0 },
    degraded: false,
    thisLifeTokensIn: 0,
    thisLifeTokensOut: 0,
    thisLifeCostUsd: 0,
  };
}

function readAutosave(): AutosaveSnapshot | null {
  return readLocal<AutosaveSnapshot | null>(AUTOSAVE_KEY, null);
}

function writeAutosave(snapshot: AutosaveSnapshot | null): void {
  writeLocal(AUTOSAVE_KEY, snapshot);
}

export const useGameStore = create<StoreState>((set, get) => ({
  locale: readLocal<Locale>(LOCALE_KEY, 'ru'),
  ackWarning: readLocal<boolean>(ACK_WARNING_KEY, false),
  preferredSpeed: readLocal<GameSpeed>(SPEED_KEY, 1),

  phase: 'menu',
  character: null,
  country: null,
  region: null,
  timeline: [],
  statsHistory: [],
  clock: null,
  rarity: null,
  session: null,
  setupDraft: { length: 'normal', birthMode: 'random' },
  pendingChoice: null,
  resolvedChoiceLabels: null,
  causeOfDeath: null,
  epilogueText: null,
  sessionStartedAt: null,
  resumePromptAvailable: false,
  lastAutosaveAt: 0,
  awaitingText: false,
  aiConsecutiveFailures: 0,

  ai: defaultAiState(),

  rng: null,
  firedOnceIds: new Set(),

  setLocale: (l) => {
    writeLocal(LOCALE_KEY, l);
    set({ locale: l });
  },

  acknowledgeWarning: () => {
    writeLocal(ACK_WARNING_KEY, true);
    set({ ackWarning: true });
  },

  updateSetupDraft: (partial) => set((s) => ({ setupDraft: { ...s.setupDraft, ...partial } })),

  goToMenu: () => set({ phase: 'menu' }),
  goToSetup: () => set({ phase: 'setup' }),
  goToJournal: () => set({ phase: 'journal' }),
  goToAiSetup: () => set({ phase: 'ai-setup' }),

  startNewLife: () => {
    const draft = get().setupDraft;
    const seed = draft.seed && draft.seed.trim().length > 0 ? draft.seed.trim() : randomSeed();
    const rng = createRng(seed);
    const { character, country, region, rarity } = generateCharacter(seed, rng, {
      mode: draft.birthMode,
      countryIso3: draft.countryIso3,
      regionId: draft.regionId,
    });
    const session: SessionConfig = {
      length: draft.length,
      sessionSeconds: { short: 600, normal: 1800, long: 5400 }[draft.length],
      birthMode: draft.birthMode,
      countryIso3: draft.countryIso3,
      regionId: draft.regionId,
      seed,
    };
    const expectedLifespan = country.lifeExpectancy[character.sex];
    let clock = createClockState(draft.length, expectedLifespan);
    clock = setSpeed(clock, get().preferredSpeed);

    set({
      phase: 'birth',
      character,
      country,
      region,
      rarity,
      session,
      timeline: [],
      statsHistory: [{ age: 0, ...character.stats }],
      clock,
      rng,
      firedOnceIds: new Set(),
      pendingChoice: null,
      resolvedChoiceLabels: null,
      causeOfDeath: null,
      epilogueText: null,
      aiConsecutiveFailures: 0,
      ai: { ...get().ai, thisLifeTokensIn: 0, thisLifeTokensOut: 0, thisLifeCostUsd: 0 },
    });
  },

  confirmBirthAndLive: () => {
    const { clock } = get();
    if (!clock) return;
    set({
      phase: 'alive',
      sessionStartedAt: Date.now(),
      clock: { ...clock, phaseStartedAt: Date.now(), lastTickAt: Date.now() },
    });
  },

  tickClock: (deltaMs) => {
    const state = get();
    const { phase, clock, character, country, awaitingText } = state;
    if (phase !== 'alive' || !clock || clock.paused || !character || !character.alive || !country || awaitingText) {
      return;
    }

    const thresholdMs = secondsForYear(clock, character.ageYears) * 1000;
    const accumulatorMs = clock.accumulatorMs + deltaMs;
    const secondsElapsed = clock.secondsElapsed + deltaMs / 1000;

    if (accumulatorMs < thresholdMs) {
      set({ clock: { ...clock, accumulatorMs, secondsElapsed } });
      maybeAutosave(get());
      return;
    }

    set({ awaitingText: true, clock: { ...clock, accumulatorMs: accumulatorMs - thresholdMs, secondsElapsed } });
    void performYearTick();
  },

  resolveChoice: (choiceId, resolvedBy) => {
    set({ awaitingText: true });
    void performResolveChoice(choiceId, resolvedBy);
  },

  setSpeedPreference: (speed) => {
    writeLocal(SPEED_KEY, speed);
    set((s) => ({ preferredSpeed: speed, clock: s.clock ? setSpeed(s.clock, speed) : s.clock }));
  },

  togglePause: () => set((s) => (s.clock ? { clock: setPaused(s.clock, !s.clock.paused) } : {})),

  quitAndForget: () => {
    writeAutosave(null);
    set({
      phase: 'menu',
      character: null,
      country: null,
      region: null,
      timeline: [],
      statsHistory: [],
      clock: null,
      pendingChoice: null,
      resolvedChoiceLabels: null,
      causeOfDeath: null,
      epilogueText: null,
      rng: null,
    });
  },

  continueToEpilogue: () => {
    set({ awaitingText: true });
    void performPrepareEpilogue();
  },

  liveAnotherOne: () => {
    set((s) => ({ setupDraft: { ...s.setupDraft, seed: undefined } }));
    get().startNewLife();
  },

  liveSameSeed: () => {
    const seed = get().character?.seed ?? get().session?.seed;
    if (!seed) return;
    set((s) => ({
      setupDraft: { ...s.setupDraft, seed, birthMode: 'random', countryIso3: undefined, regionId: undefined },
    }));
    get().startNewLife();
  },

  checkAutosave: () => {
    const snap = readAutosave();
    set({ resumePromptAvailable: !!snap });
  },

  resumeAutosave: () => {
    const snap = readAutosave();
    if (!snap) return;
    const country = getCountry(snap.countryIso3);
    const region = snap.regionId ? getRegion(snap.regionId) : null;
    const rng = createRng(snap.character.seed + ':resume:' + snap.character.ageYears);
    const expectedLifespan = country.lifeExpectancy[snap.character.sex];
    let clock = createClockState(snap.session.length, expectedLifespan);
    clock = setSpeed(clock, get().preferredSpeed);
    set({
      phase: 'alive',
      character: snap.character,
      country,
      region,
      timeline: snap.timeline,
      statsHistory: snap.statsHistory,
      session: snap.session,
      clock: { ...clock, phaseStartedAt: Date.now(), lastTickAt: Date.now() },
      rng,
      firedOnceIds: new Set(snap.firedOnceIds),
      resumePromptAvailable: false,
    });
  },

  discardAutosave: () => {
    const snap = readAutosave();
    writeAutosave(null);
    set({ resumePromptAvailable: false });
    if (snap) {
      void addLifeLogEntry({
        seed: snap.character.seed,
        countryIso3: snap.countryIso3,
        regionId: snap.regionId,
        sex: snap.character.sex,
        birthYear: snap.character.birthYear,
        deathYear: null,
        ageAtDeath: null,
        causeOfDeath: null,
        finalStats: snap.character.stats,
        choiceCount: snap.timeline.filter((e) => e.resolvedBy).length,
        timeoutCount: snap.timeline.filter((e) => e.resolvedBy === 'timeout').length,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        rarityOneInN: null,
        rarityComplete: false,
        manualSelection: snap.character.manualSelection,
        interrupted: true,
        timeline: snap.timeline,
        createdAt: Date.now(),
      });
    }
  },

  setAiProvider: (provider) => set((s) => ({ ai: { ...s.ai, provider, verified: false, model: null } })),
  setAiKey: (key, remember) => {
    persistAiKey(key, remember);
    set((s) => ({ ai: { ...s.ai, apiKeyPresent: true, rememberKey: remember, verified: false } }));
  },
  clearAiKey: () => {
    clearKey();
    set((s) => ({ ai: { ...s.ai, apiKeyPresent: false, verified: false } }));
  },
  setAiBaseUrl: (url) => {
    persistAiBaseUrl(url);
    set((s) => ({ ai: { ...s.ai, baseUrl: url, verified: false } }));
  },
  setAiModel: (model) => set((s) => ({ ai: { ...s.ai, model } })),
  setAiVerified: (verified, label) => set((s) => ({ ai: { ...s.ai, verified, verifiedLabel: label } })),
  setAiBudget: (budget) => set((s) => ({ ai: { ...s.ai, budget: { ...s.ai.budget, ...budget } } })),
  toggleDescribeAll: () => set((s) => ({ ai: { ...s.ai, describeAllViaAi: !s.ai.describeAllViaAi } })),
  dismissDegraded: () => set((s) => ({ ai: { ...s.ai, degraded: false, degradedReason: undefined }, aiConsecutiveFailures: 0 })),
}));

function maybeAutosave(state: StoreState): void {
  if (state.phase !== 'alive' && state.phase !== 'choice') return;
  const now = Date.now();
  if (now - state.lastAutosaveAt < AUTOSAVE_INTERVAL_MS) return;
  if (!state.character || !state.session) return;
  writeAutosave({
    character: state.character,
    countryIso3: state.country?.iso3 ?? state.character.countryIso3,
    regionId: state.region?.id ?? null,
    timeline: state.timeline,
    statsHistory: state.statsHistory,
    session: state.session,
    firedOnceIds: Array.from(state.firedOnceIds),
    savedAt: now,
  });
  useGameStore.setState({ lastAutosaveAt: now });
}

async function persistLifeToJournal(state: StoreState): Promise<void> {
  const { character, country, region, causeOfDeath, timeline, session, ai } = state;
  if (!character || !country || !session) return;
  await addLifeLogEntry({
    seed: character.seed,
    countryIso3: country.iso3,
    regionId: region?.id ?? null,
    sex: character.sex,
    birthYear: character.birthYear,
    deathYear: character.birthYear + character.ageYears,
    ageAtDeath: character.ageYears,
    causeOfDeath: causeOfDeath?.id ?? null,
    finalStats: character.stats,
    choiceCount: timeline.filter((e) => e.resolvedBy).length,
    timeoutCount: timeline.filter((e) => e.resolvedBy === 'timeout').length,
    tokensIn: ai.thisLifeTokensIn,
    tokensOut: ai.thisLifeTokensOut,
    costUsd: ai.thisLifeCostUsd,
    rarityOneInN: state.rarity?.oneInN ?? null,
    rarityComplete: state.rarity?.complete ?? false,
    manualSelection: character.manualSelection,
    interrupted: false,
    timeline,
    createdAt: Date.now(),
  });
}

function recordAiOutcome(source: 'ai' | 'offline', attempted: boolean): void {
  if (!attempted) return;
  const state = useGameStore.getState();
  if (source === 'ai') {
    if (state.aiConsecutiveFailures !== 0) useGameStore.setState({ aiConsecutiveFailures: 0 });
    return;
  }
  const failures = state.aiConsecutiveFailures + 1;
  if (failures >= DEGRADE_AFTER_CONSECUTIVE_FAILURES && !state.ai.degraded) {
    useGameStore.setState({
      aiConsecutiveFailures: failures,
      ai: { ...state.ai, degraded: true, degradedReason: 'ИИ не отвечает или отклоняет запросы — продолжаем на шаблонах.' },
    });
  } else {
    useGameStore.setState({ aiConsecutiveFailures: failures });
  }
}

async function performYearTick(): Promise<void> {
  const state = useGameStore.getState();
  const { character, country, region, rng, firedOnceIds, locale, ai, timeline } = state;
  if (!character || !country || !rng) {
    useGameStore.setState({ awaitingText: false });
    return;
  }

  const result = runYearTick(character, country, region, allEvents, firedOnceIds, rng);
  for (const f of result.fired) if (f.def.once) firedOnceIds.add(f.def.id);
  const nextStatsHistory = [...state.statsHistory, { age: result.character.ageYears, ...result.character.stats }];

  const recentTitles = timeline.slice(-3).map((e) => e.title);
  const newEvents: LifeEvent[] = [];
  let index = timeline.length;
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;

  for (const f of result.fired) {
    const ambientWasAiEligible = f.def.severity === 'notable' || f.def.severity === 'major' || ai.describeAllViaAi;
    const resolved = await resolveEventText(
      f.def,
      result.character,
      country,
      result.character.traits,
      recentTitles,
      locale,
      ai,
    );
    recordAiOutcome(resolved.source, ambientWasAiEligible && !!country);
    if (resolved.usage) {
      totalIn += resolved.usage.tokensIn;
      totalOut += resolved.usage.tokensOut;
      totalCost += resolved.usage.costUsd;
    }
    const base = buildOfflineLifeEvent(
      f.def,
      index++,
      result.character.birthYear + result.character.ageYears,
      result.character.ageYears,
      locale,
    );
    newEvents.push({ ...base, title: resolved.title, body: resolved.body, source: resolved.source });
    recentTitles.push(resolved.title);
    if (recentTitles.length > 3) recentTitles.shift();
  }

  let nextClock = state.clock!;
  if (result.character.ageYears % 5 === 0) nextClock = recalibratePace(nextClock, result.character.ageYears);
  if (shouldEnterAcceleratedRemainder(nextClock)) nextClock = { ...nextClock, acceleratedRemainder: true };

  const aiAfterUsage: AiState = {
    ...ai,
    thisLifeTokensIn: ai.thisLifeTokensIn + totalIn,
    thisLifeTokensOut: ai.thisLifeTokensOut + totalOut,
    thisLifeCostUsd: ai.thisLifeCostUsd + totalCost,
    budget: {
      ...ai.budget,
      spentUsd: ai.budget.spentUsd + totalCost,
      spentTokensIn: ai.budget.spentTokensIn + totalIn,
      spentTokensOut: ai.budget.spentTokensOut + totalOut,
    },
  };

  if (result.died) {
    useGameStore.setState({
      character: result.character,
      timeline: [...timeline, ...newEvents],
      statsHistory: nextStatsHistory,
      causeOfDeath: result.causeOfDeath,
      clock: nextClock,
      phase: 'dead',
      awaitingText: false,
      ai: aiAfterUsage,
    });
    writeAutosave(null);
    void persistLifeToJournal(useGameStore.getState());
    return;
  }

  if (result.pendingChoice) {
    const pendingDef = result.pendingChoice.def;
    const choiceAiEligible = pendingDef.severity === 'notable' || pendingDef.severity === 'major' || ai.describeAllViaAi;

    const textResolved = await resolveEventText(
      pendingDef,
      result.character,
      country,
      result.character.traits,
      recentTitles,
      locale,
      aiAfterUsage,
    );
    recordAiOutcome(textResolved.source, choiceAiEligible);
    let finalAi = aiAfterUsage;
    if (textResolved.usage) {
      finalAi = {
        ...finalAi,
        thisLifeTokensIn: finalAi.thisLifeTokensIn + textResolved.usage.tokensIn,
        thisLifeTokensOut: finalAi.thisLifeTokensOut + textResolved.usage.tokensOut,
        thisLifeCostUsd: finalAi.thisLifeCostUsd + textResolved.usage.costUsd,
        budget: { ...finalAi.budget, spentUsd: finalAi.budget.spentUsd + textResolved.usage.costUsd },
      };
    }

    const labelsResolved = await resolveChoiceLabels(
      pendingDef,
      result.pendingChoice.choices,
      result.character,
      locale,
      finalAi,
      textResolved.title,
      textResolved.body,
    );
    recordAiOutcome(labelsResolved.source, choiceAiEligible);
    if (labelsResolved.usage) {
      finalAi = {
        ...finalAi,
        thisLifeTokensIn: finalAi.thisLifeTokensIn + labelsResolved.usage.tokensIn,
        thisLifeTokensOut: finalAi.thisLifeTokensOut + labelsResolved.usage.tokensOut,
        thisLifeCostUsd: finalAi.thisLifeCostUsd + labelsResolved.usage.costUsd,
        budget: {
          ...finalAi.budget,
          spentUsd: finalAi.budget.spentUsd + labelsResolved.usage.costUsd,
        },
      };
    }
    useGameStore.setState({
      character: result.character,
      timeline: [...timeline, ...newEvents],
      statsHistory: nextStatsHistory,
      clock: { ...nextClock, paused: true },
      phase: 'choice',
      pendingChoice: {
        def: pendingDef,
        choices: result.pendingChoice.choices,
        title: textResolved.title,
        body: textResolved.body,
        source: textResolved.source,
        openedAt: Date.now(),
      },
      resolvedChoiceLabels: labelsResolved.labels,
      awaitingText: false,
      ai: finalAi,
    });
    maybeAutosave(useGameStore.getState());
    return;
  }

  useGameStore.setState({
    character: result.character,
    timeline: [...timeline, ...newEvents],
    statsHistory: nextStatsHistory,
    clock: nextClock,
    awaitingText: false,
    ai: aiAfterUsage,
  });
  maybeAutosave(useGameStore.getState());
}

async function performResolveChoice(choiceId: string | null, resolvedBy: 'player' | 'timeout'): Promise<void> {
  const state = useGameStore.getState();
  const { pendingChoice, character, timeline, rng, firedOnceIds, clock } = state;
  if (!pendingChoice || !character || !rng || !clock) {
    useGameStore.setState({ awaitingText: false });
    return;
  }
  const choice =
    (choiceId && pendingChoice.choices.find((c) => c.id === choiceId)) ||
    pendingChoice.choices[Math.floor(rng() * pendingChoice.choices.length)];

  const updatedCharacter = resolvePendingChoice(character, { def: pendingChoice.def, choices: pendingChoice.choices }, choice);
  if (pendingChoice.def.once) firedOnceIds.add(pendingChoice.def.id);

  // Используем уже резолвленные title/body (офлайн или ИИ, см. performYearTick) —
  // повторный вызов buildOfflineLifeEvent здесь отбросил бы текст от ИИ.
  const base: LifeEvent = {
    id: `evt_${timeline.length}_${pendingChoice.def.id}`,
    defId: pendingChoice.def.id,
    year: updatedCharacter.birthYear + updatedCharacter.ageYears,
    age: updatedCharacter.ageYears,
    category: pendingChoice.def.category,
    severity: pendingChoice.def.severity,
    title: pendingChoice.title,
    body: pendingChoice.body,
    source: pendingChoice.source,
    choices: pendingChoice.def.choices,
    resolvedBy,
    chosenId: choice.id,
    effects: choice.effects,
  };

  useGameStore.setState({
    character: updatedCharacter,
    timeline: [...timeline, base],
    pendingChoice: null,
    resolvedChoiceLabels: null,
    phase: 'alive',
    clock: { ...clock, paused: false },
    awaitingText: false,
  });
  maybeAutosave(useGameStore.getState());
}

async function performPrepareEpilogue(): Promise<void> {
  const state = useGameStore.getState();
  const { character, country, causeOfDeath, timeline, locale, ai } = state;
  if (!character || !country) {
    useGameStore.setState({ awaitingText: false, phase: 'epilogue' });
    return;
  }
  const notable = timeline.filter((e) => e.severity !== 'minor').slice(-12).map((e) => e.title);
  const result = await resolveEpilogue(
    {
      countryName: country.name[locale] ?? country.name.ru,
      sex: character.sex,
      ageAtDeath: character.ageYears,
      causeOfDeathLabel: causeOfDeath?.label[locale] ?? causeOfDeath?.label.ru ?? '—',
      notableEventTitles: notable,
      finalStats: character.stats,
    },
    locale,
    ai,
  );
  recordAiOutcome(result.source, true);
  let nextAi = ai;
  if (result.usage) {
    nextAi = {
      ...ai,
      thisLifeTokensIn: ai.thisLifeTokensIn + result.usage.tokensIn,
      thisLifeTokensOut: ai.thisLifeTokensOut + result.usage.tokensOut,
      thisLifeCostUsd: ai.thisLifeCostUsd + result.usage.costUsd,
      budget: { ...ai.budget, spentUsd: ai.budget.spentUsd + result.usage.costUsd },
    };
  }
  useGameStore.setState({ epilogueText: result.text, phase: 'epilogue', awaitingText: false, ai: nextAi });
}
