import type { AbilityId } from "./abilities";
import { aiPersonalities, type AiPersonality } from "./ai";
import type { Faction, FortKind } from "./logic";
import type { LevelObjective } from "./objectives";
import type { ChallengeRule } from "./scoring";
import type { Biome } from "./terrain";
import type { Fort, Point } from "./types";

export type LevelFortress = Fort;
export interface Level {
  id: number;
  name: string;
  biome: Biome;
  briefing: string;
  forts: LevelFortress[];
  aiDelay: number;
  waypoints: Point[];
  speed: number;
  aiPersonality: AiPersonality;
  aiAbility: AbilityId | null;
  objective: LevelObjective;
  challenges: ChallengeRule[];
}

/** 双方老家都是要塞，越往外越脆；中路刻意混编，让"先抢哪座"成为选择题。 */
const homeKinds: FortKind[] = ["fortress", "barracks", "barracks", "outpost"];
const middleKinds: FortKind[] = [
  "barracks",
  "outpost",
  "fortress",
  "barracks",
  "outpost",
  "fortress",
];
const startingGarrison: Record<FortKind, number> = { fortress: 40, barracks: 30, outpost: 24 };
const neutralGarrison: Record<FortKind, number> = { fortress: 24, barracks: 22, outpost: 16 };

const layout = (count: number, player: number, ai: number): LevelFortress[] => {
  const left = [
    [150, 165],
    [260, 430],
    [150, 470],
    [270, 155],
  ];
  const middle = [
    [510, 155],
    [590, 290],
    [500, 440],
    [650, 465],
    [690, 130],
    [430, 300],
  ];
  const right = left.map(([x, y]) => [1100 - x, y]);
  const make = (point: number[], faction: Faction, kind: FortKind): LevelFortress => ({
    x: point[0],
    y: point[1],
    faction,
    kind,
    soldiers: faction === "neutral" ? neutralGarrison[kind] : startingGarrison[kind],
  });
  const neutral = count - player - ai;
  return [
    ...left.slice(0, player).map((point, index) => make(point, "player", homeKinds[index])),
    ...middle.slice(0, neutral).map((point, index) => make(point, "neutral", middleKinds[index])),
    ...right.slice(0, ai).map((point, index) => make(point, "ai", homeKinds[index])),
  ];
};

const riverPositions: Point[] = [
  { x: 150, y: 165 },
  { x: 260, y: 430 },
  { x: 410, y: 160 },
  { x: 410, y: 470 },
  { x: 760, y: 285 },
  { x: 720, y: 500 },
  { x: 950, y: 165 },
  { x: 840, y: 430 },
];

const placeForts = (biome: Biome, count: number, player: number, ai: number) => {
  const forts = layout(count, player, ai);
  return biome === "river"
    ? forts.map((fort, index) => ({ ...fort, ...riverPositions[index] }))
    : forts;
};

type LevelSpec = [
  string,
  Biome,
  string,
  number,
  number,
  number,
  Point[],
  number,
  AiPersonality,
  LevelObjective?,
];

const specs: LevelSpec[] = [
  ["边境草原", "grassland", "双方各两座堡垒，学习拖拽派兵与占领。", 6, 2, 2, [], 1, "aggressive"],
  [
    "河谷要塞",
    "river",
    "跨河必须经由木桥。",
    8,
    2,
    2,
    [
      { x: 588, y: 214 },
      { x: 590, y: 439 },
    ],
    1,
    "expansionist",
  ],
  [
    "沙漠绿洲",
    "desert",
    "夺取中央绿洲并连续控制 45 秒，敌军逼近时计时暂停。",
    8,
    2,
    2,
    [{ x: 550, y: 365 }],
    0.72,
    "aggressive",
    { kind: "hold", target: 3, duration: 45 },
  ],
  [
    "雨林遗迹",
    "jungle",
    "密林封锁，遗迹通道是唯一近路。",
    10,
    2,
    2,
    [
      { x: 490, y: 235 },
      { x: 630, y: 375 },
    ],
    0.82,
    "expansionist",
  ],
  [
    "雪原关隘",
    "snow",
    "守住左上核心要塞 90 秒，等待北境援军抵达。",
    10,
    2,
    2,
    [
      { x: 555, y: 215 },
      { x: 570, y: 395 },
    ],
    0.75,
    "aggressive",
    { kind: "defend", target: 0, duration: 90 },
  ],
  [
    "群岛海峡",
    "islands",
    "海峡阻隔，必须通过渡口。",
    10,
    3,
    3,
    [{ x: 540, y: 365 }],
    0.78,
    "guardian",
  ],
  [
    "火山裂谷",
    "volcano",
    "熔岩裂谷迫使军团走安全石桥。",
    10,
    3,
    3,
    [{ x: 560, y: 370 }],
    0.8,
    "aggressive",
  ],
  [
    "高原风暴",
    "highland",
    "山脊绕行，风暴减慢增援。",
    12,
    3,
    3,
    [
      { x: 475, y: 235 },
      { x: 650, y: 350 },
    ],
    0.68,
    "expansionist",
  ],
  [
    "古城围攻",
    "city",
    "沿金色标记依次攻破外城、军营与王城要塞。",
    12,
    3,
    3,
    [{ x: 555, y: 360 }],
    0.84,
    "guardian",
    { kind: "captureSequence", targets: [4, 10, 9] },
  ],
  [
    "王都决战",
    "capital",
    "王都广场是多线战场的必经核心。",
    12,
    4,
    4,
    [
      { x: 495, y: 240 },
      { x: 610, y: 375 },
    ],
    0.8,
    "aggressive",
  ],
];

const challengeSets: [ChallengeRule, ChallengeRule][] = [
  [
    { kind: "time", seconds: 90 },
    { kind: "abilitiesUsed", maximum: 1 },
  ],
  [
    { kind: "time", seconds: 130 },
    { kind: "fortsLost", maximum: 0 },
  ],
  [
    { kind: "time", seconds: 105 },
    { kind: "abilitiesUsed", maximum: 2 },
  ],
  [
    { kind: "time", seconds: 170 },
    { kind: "casualties", maximum: 130 },
  ],
  [
    { kind: "time", seconds: 100 },
    { kind: "abilitiesUsed", maximum: 1 },
  ],
  [
    { kind: "time", seconds: 190 },
    { kind: "casualties", maximum: 180 },
  ],
  [
    { kind: "time", seconds: 190 },
    { kind: "abilitiesUsed", maximum: 2 },
  ],
  [
    { kind: "time", seconds: 220 },
    { kind: "fortsLost", maximum: 1 },
  ],
  [
    { kind: "time", seconds: 230 },
    { kind: "casualties", maximum: 220 },
  ],
  [
    { kind: "time", seconds: 260 },
    { kind: "fortsLost", maximum: 1 },
  ],
];

export const levels: Level[] = specs.map(
  ([name, biome, briefing, count, player, ai, waypoints, speed, aiPersonality, objective], i) => ({
    id: i + 1,
    name,
    biome,
    briefing,
    forts: placeForts(biome, count, player, ai),
    waypoints,
    speed,
    aiDelay: Math.max(0.72, 1.8 - i * 0.11),
    aiPersonality,
    aiAbility: i === 0 ? null : aiPersonalities[aiPersonality].ability,
    objective: objective ?? { kind: "eliminate" },
    challenges: [{ kind: "victory" }, ...challengeSets[i]],
  }),
);
export const getLevel = (id: number) => {
  const safeId = Number.isFinite(id) ? Math.trunc(id) : 1;
  return levels[Math.max(0, Math.min(levels.length - 1, safeId - 1))];
};
