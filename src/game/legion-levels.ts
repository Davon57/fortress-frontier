import type { Faction, FortKind } from "./logic";
import { armyOf } from "./legion-logic";
import type { Biome } from "./terrain";
import type { ArmyComposition, Point, UnitType } from "./types";

export interface LegionFort extends Point {
  faction: Faction;
  kind: FortKind;
  specialization: UnitType;
  army: ArmyComposition;
}

export interface LegionLevel {
  id: number;
  name: string;
  biome: Biome;
  briefing: string;
  forts: LegionFort[];
  waypoints: Point[];
  speed: number;
  aiDelay: number;
}

const kindForUnit: Record<UnitType, FortKind> = {
  infantry: "barracks",
  archer: "outpost",
  cavalry: "fortress",
};

const fort = (
  x: number,
  y: number,
  faction: Faction,
  specialization: UnitType,
  soldiers: number,
): LegionFort => ({
  x,
  y,
  faction,
  specialization,
  kind: kindForUnit[specialization],
  army: armyOf(specialization, soldiers),
});

export const legionLevels: LegionLevel[] = [
  {
    id: 1,
    name: "三军初阵",
    biome: "grassland",
    briefing: "识别步兵、弓兵与骑兵的三角克制，夺取三座中立军营。",
    waypoints: [],
    speed: 1,
    aiDelay: 1.7,
    forts: [
      fort(135, 160, "player", "infantry", 34),
      fort(155, 455, "player", "archer", 30),
      fort(300, 305, "player", "cavalry", 28),
      fort(485, 145, "neutral", "archer", 16),
      fort(550, 305, "neutral", "infantry", 20),
      fort(485, 475, "neutral", "cavalry", 15),
      fort(965, 160, "ai", "infantry", 34),
      fort(945, 455, "ai", "archer", 30),
      fort(800, 305, "ai", "cavalry", 28),
    ],
  },
  {
    id: 2,
    name: "河谷混编",
    biome: "river",
    briefing: "跨桥增援会形成混编军团，利用克制关系争夺两岸前线。",
    waypoints: [
      { x: 588, y: 214 },
      { x: 590, y: 439 },
    ],
    speed: 0.92,
    aiDelay: 1.35,
    forts: [
      fort(130, 140, "player", "infantry", 38),
      fort(145, 470, "player", "archer", 32),
      fort(335, 315, "player", "cavalry", 30),
      fort(425, 155, "neutral", "cavalry", 17),
      fort(430, 465, "neutral", "infantry", 20),
      fort(755, 155, "neutral", "archer", 17),
      fort(750, 465, "neutral", "cavalry", 16),
      fort(970, 140, "ai", "infantry", 38),
      fort(955, 470, "ai", "archer", 32),
      fort(765, 315, "ai", "cavalry", 30),
    ],
  },
  {
    id: 3,
    name: "王旗会战",
    biome: "city",
    briefing: "敌军会主动寻找克制优势；组织混编军团，攻破中央王旗要塞。",
    waypoints: [
      { x: 520, y: 205 },
      { x: 590, y: 405 },
    ],
    speed: 0.86,
    aiDelay: 1.05,
    forts: [
      fort(125, 130, "player", "infantry", 42),
      fort(135, 480, "player", "archer", 36),
      fort(300, 210, "player", "cavalry", 32),
      fort(300, 410, "player", "infantry", 34),
      fort(485, 125, "neutral", "archer", 20),
      fort(550, 305, "neutral", "infantry", 28),
      fort(485, 490, "neutral", "cavalry", 18),
      fort(615, 125, "neutral", "cavalry", 18),
      fort(975, 130, "ai", "infantry", 42),
      fort(965, 480, "ai", "archer", 36),
      fort(800, 210, "ai", "cavalry", 32),
      fort(800, 410, "ai", "infantry", 34),
    ],
  },
];

export const getLegionLevel = (id: number) => {
  const safeId = Number.isFinite(id) ? Math.trunc(id) : 1;
  return legionLevels[Math.max(0, Math.min(legionLevels.length - 1, safeId - 1))];
};
