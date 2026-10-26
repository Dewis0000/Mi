// Контракт данных между движком, ИИ-слоем и интерфейсом.
// См. раздел 5 спецификации. Типы, которых спецификация не определяла
// явно (ClockState, AiState, RarityReport, Session*), дописаны здесь —
// решения зафиксированы там, где спецификация молчала.

export type Sex = 'male' | 'female';
export type IncomeTier = 'low' | 'lower-middle' | 'upper-middle' | 'high';

export type EventCategory =
  | 'health'
  | 'family'
  | 'education'
  | 'work'
  | 'marriage'
  | 'migration'
  | 'disaster'
  | 'conflict'
  | 'fortune'
  | 'tradition'
  | 'crime'
  | 'death';

export interface Country {
  iso3: string;
  name: Record<string, string>;
  population: number;
  birthsPerYear: number;
  lifeExpectancy: { male: number; female: number };
  infantMortality: number; // на 1000 рождений
  gdpPerCapita: number;
  gini: number;
  urbanShare: number; // 0..1
  incomeTier: IncomeTier;
  schoolingYears: number;
  conflictIndex: number; // 0..1
  homicideRate: number; // на 100 000 в год
  maleBirthShare?: number; // доля мальчиков при рождении, по умолчанию 0.512
  traditionPacks: string[];
  regions: string[];
}

export interface Region {
  id: string;
  countryIso3: string;
  name: Record<string, string>;
  populationShare: number;
  urban: boolean;
  wealthModifier: number; // -0.4 .. +0.6
  healthModifier: number; // 0.6 .. 1.8
  educationModifier: number;
  hazards: string[];
}

export interface TraditionPack {
  id: string;
  label: Record<string, string>;
  namePool: { male: string[]; female: string[]; family: string[] };
  norms: {
    earlyMarriageRate: { male: number; female: number };
    expectedChildren: number;
    genderEducationGap: number; // 0..1
    elderCohabitation: number;
    migrationPropensity: number;
  };
  flavorEvents: string[];
}

export interface CauseOfDeath {
  id: string;
  label: Record<string, string>;
  ageGate: [number, number];
  incomeWeight: Partial<Record<IncomeTier, number>>;
  baseWeight: number;
  sex?: Sex; // ограничение по полу (материнская смертность)
}

export interface Family {
  incomeDecile: number; // 1..10
  parentsAlive: { mother: boolean; father: boolean };
  siblings: number;
  parentEducationYears: number;
  rural: boolean;
  traditionPackId: string;
}

export interface Stats {
  health: number; // 0..100
  wealth: number; // 0..100
  education: number; // 0..100
  bonds: number; // 0..100
  standing: number; // 0..100
}

export interface Character {
  seed: string;
  name: string;
  sex: Sex;
  birthYear: number;
  countryIso3: string;
  regionId: string | null;
  family: Family;
  stats: Stats;
  ageYears: number;
  alive: boolean;
  childrenCount: number;
  traits: string[];
  activeMortalityModifiers: MortalityModifier[];
  manualSelection: 'random' | 'country' | 'region';
}

export interface MortalityModifier {
  id: string;
  multiplier: number;
  untilYear: number;
}

export interface Requirement {
  traits?: string[];
  excludeTraits?: string[];
  statsBelow?: Partial<Stats>;
  statsAbove?: Partial<Stats>;
  sex?: Sex;
  rural?: boolean;
  urban?: boolean;
  incomeTier?: IncomeTier[];
  manualOk?: boolean;
}

export interface Choice {
  id: string;
  // Текст лежит в i18n-словаре по ключу `event.<eventId>.choice.<id>.label`
  // (раздел 17: "Все тексты событий... ключами, не строками в коде"), а не
  // здесь — UI резолвит его при отображении, зная id родительского события.
  riskLabel: 'надёжно' | 'рискованно' | 'неизвестно';
  effects: Partial<Stats>;
  mortalityDelta: number;
  mortalityYears?: number;
  unlockTraits?: string[];
  childrenDelta?: number;
  requires?: Requirement;
}

export interface EventDefinition {
  id: string;
  category: EventCategory;
  severity: 'minor' | 'notable' | 'major' | 'fatal';
  ageGate: [number, number];
  requires?: Requirement;
  weightBy?: {
    rural?: number;
    urban?: number;
    incomeTier?: Partial<Record<IncomeTier, number>>;
    conflictIndex?: number;
    homicideRate?: number;
    hazardTag?: Record<string, number>;
  };
  baseWeight: number;
  titleKey: string;
  bodyKey: string;
  once?: boolean;
  choices?: Choice[];
  effects?: Partial<Stats>;
  mortalityDelta?: number;
  mortalityYears?: number;
  unlockTraits?: string[];
  childrenDelta?: number;
}

export interface LifeEvent {
  id: string;
  defId: string;
  year: number;
  age: number;
  category: EventCategory;
  severity: 'minor' | 'notable' | 'major' | 'fatal';
  title: string;
  body: string;
  source: 'ai' | 'offline';
  choices?: Choice[];
  resolvedBy?: 'player' | 'timeout';
  chosenId?: string;
  effects: Partial<Stats>;
}

export interface RarityReport {
  complete: boolean; // false при ручном выборе страны/региона
  countryShare: number;
  regionShare: number;
  sexShare: number;
  decileShare: number;
  ruralUrbanShare: number;
  combined: number; // произведение, "1 из N" = 1/combined
  oneInN: number;
  tier: 'обычная' | 'редкая' | 'очень редкая' | 'исключительная';
}

export type SessionLength = 'short' | 'normal' | 'long';
export type BirthMode = 'random' | 'country' | 'region';
export type GameSpeed = 1 | 2 | 4;

export interface SessionConfig {
  length: SessionLength;
  sessionSeconds: number;
  birthMode: BirthMode;
  countryIso3?: string;
  regionId?: string;
  seed?: string;
}

export interface ClockState {
  phaseStartedAt: number | null;
  sessionSeconds: number;
  secondsElapsed: number;
  secondsPerYearBase: number;
  expectedLifespan: number;
  speed: GameSpeed;
  paused: boolean;
  paceAdjustment: number; // пересчитывается каждые 5 игровых лет, не больше 2x от базового темпа
  acceleratedRemainder: boolean;
  lastTickAt: number | null;
  accumulatorMs: number;
}

export type AiProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';

export interface AiModelInfo {
  id: string;
  label: string;
  inputPricePerM: number; // USD за 1M входных токенов
  outputPricePerM: number; // USD за 1M выходных токенов
  speed: 'быстрая' | 'средняя' | 'медленная';
  tier: 'economy' | 'balanced' | 'literary';
}

export interface AiBudget {
  limitUsd: number;
  scope: 'session' | 'day' | 'all-time';
  spentUsd: number;
  spentTokensIn: number;
  spentTokensOut: number;
}

export interface AiState {
  provider: AiProviderId | null;
  apiKeyPresent: boolean;
  rememberKey: boolean; // false => sessionStorage, true => localStorage
  baseUrl?: string; // для custom
  model: string | null;
  verified: boolean;
  verifiedLabel?: string;
  describeAllViaAi: boolean;
  budget: AiBudget;
  degraded: boolean;
  degradedReason?: string;
  lastCallTokens?: number;
  lastCallMs?: number;
  thisLifeTokensIn: number;
  thisLifeTokensOut: number;
  thisLifeCostUsd: number;
}

export type GamePhase =
  | 'menu'
  | 'setup'
  | 'ai-setup'
  | 'birth'
  | 'alive'
  | 'choice'
  | 'dead'
  | 'epilogue'
  | 'journal';

export interface GameState {
  phase: GamePhase;
  character: Character | null;
  timeline: LifeEvent[];
  clock: ClockState;
  rarity: RarityReport | null;
  ai: AiState;
  session: SessionConfig | null;
  pendingChoice: LifeEvent | null;
  activeMortalityQx: number | null;
}

export interface LifeLogEntry {
  id?: number;
  seed: string;
  countryIso3: string;
  regionId: string | null;
  sex: Sex;
  birthYear: number;
  deathYear: number | null;
  ageAtDeath: number | null;
  causeOfDeath: string | null;
  finalStats: Stats | null;
  choiceCount: number;
  timeoutCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  rarityOneInN: number | null;
  rarityComplete: boolean;
  manualSelection: 'random' | 'country' | 'region';
  interrupted: boolean;
  timeline: LifeEvent[];
  createdAt: number;
}
