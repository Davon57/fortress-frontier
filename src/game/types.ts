import type { Faction, FortressState } from "./logic";

export interface Point {
  x: number;
  y: number;
}

export type UnitType = "infantry" | "archer" | "cavalry";
export type UnitStance = "moving" | "shield" | "firing" | "charging";

export interface ArmyComposition {
  infantry: number;
  archer: number;
  cavalry: number;
}

export interface Fort extends FortressState, Point {
  composition?: ArmyComposition;
  specialization?: UnitType;
}

export interface Squad extends Point {
  from: number;
  to: number;
  faction: Faction;
  soldiers: number;
  phase: number;
  route: Point[];
  next: number;
  composition?: ArmyComposition;
  unitType?: UnitType;
  stance?: UnitStance;
}
