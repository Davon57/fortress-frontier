import { fortProfiles, type Faction, type FortKind } from "./logic";
import type { ArmyComposition, UnitType } from "./types";

export const unitOrder: UnitType[] = ["infantry", "archer", "cavalry"];

export interface UnitProfile {
  name: string;
  shortName: string;
  production: number;
  speed: number;
  siege: number;
  color: number;
  advantage: string;
}

export const unitProfiles: Record<UnitType, UnitProfile> = {
  infantry: {
    name: "步兵",
    shortName: "步",
    production: 1.35,
    speed: 1,
    siege: 1.05,
    color: 0x8fa8bd,
    advantage: "克制骑兵，守城稳定",
  },
  archer: {
    name: "弓兵",
    shortName: "弓",
    production: 1.05,
    speed: 0.9,
    siege: 0.82,
    color: 0x78a66c,
    advantage: "克制步兵，攻城较弱",
  },
  cavalry: {
    name: "骑兵",
    shortName: "骑",
    production: 0.78,
    speed: 1.35,
    siege: 0.72,
    color: 0xd3a452,
    advantage: "克制弓兵，行军迅速",
  },
};

/** 行为克制：步兵 → 骑兵 → 弓兵 → 步兵。 */
export const matchup: Record<UnitType, Record<UnitType, number>> = {
  infantry: { infantry: 1, archer: 0.72, cavalry: 1.55 },
  archer: { infantry: 1.55, archer: 1, cavalry: 0.72 },
  cavalry: { infantry: 0.72, archer: 1.55, cavalry: 1 },
};

export const emptyArmy = (): ArmyComposition => ({
  infantry: 0,
  archer: 0,
  cavalry: 0,
});

export const armyOf = (unit: UnitType, soldiers: number): ArmyComposition => ({
  ...emptyArmy(),
  [unit]: Math.max(0, soldiers),
});

export const cloneArmy = (army: ArmyComposition): ArmyComposition => ({ ...army });

export const armyTotal = (army: ArmyComposition) =>
  unitOrder.reduce((total, unit) => total + Math.max(0, army[unit]), 0);

export const addArmies = (first: ArmyComposition, second: ArmyComposition): ArmyComposition => ({
  infantry: first.infantry + second.infantry,
  archer: first.archer + second.archer,
  cavalry: first.cavalry + second.cavalry,
});

export const scaleArmy = (army: ArmyComposition, scale: number): ArmyComposition => {
  const safeScale = Math.max(0, Number.isFinite(scale) ? scale : 0);
  return {
    infantry: army.infantry * safeScale,
    archer: army.archer * safeScale,
    cavalry: army.cavalry * safeScale,
  };
};

export const formatArmy = (army: ArmyComposition) =>
  unitOrder.map((unit) => `${unitProfiles[unit].shortName}${Math.floor(army[unit])}`).join(" · ");

export const dispatchArmy = (army: ArmyComposition, ratio: number) => {
  const total = armyTotal(army);
  if (total <= 1) return { sent: emptyArmy(), remaining: cloneArmy(army) };
  const safeRatio = Number.isFinite(ratio) ? Math.max(0.05, Math.min(1, ratio)) : 0.05;
  const sentTotal = Math.min(total - 1, total * safeRatio);
  const sent = scaleArmy(army, sentTotal / total);
  return {
    sent,
    remaining: {
      infantry: Math.max(0, army.infantry - sent.infantry),
      archer: Math.max(0, army.archer - sent.archer),
      cavalry: Math.max(0, army.cavalry - sent.cavalry),
    },
  };
};

export const produceArmy = (
  army: ArmyComposition,
  specialization: UnitType,
  seconds: number,
  capacity: number,
) => {
  const total = armyTotal(army);
  if (seconds <= 0 || total >= capacity) return cloneArmy(army);
  const produced = Math.min(capacity - total, unitProfiles[specialization].production * seconds);
  return { ...army, [specialization]: army[specialization] + produced };
};

export const armySpeed = (army: ArmyComposition) => {
  const total = armyTotal(army);
  if (total <= 0) return 1;
  return unitOrder.reduce(
    (speed, unit) => speed + (army[unit] / total) * unitProfiles[unit].speed,
    0,
  );
};

export const armyPower = (attacker: ArmyComposition, defender: ArmyComposition, siege = false) => {
  const defenderTotal = armyTotal(defender);
  if (defenderTotal <= 0) return armyTotal(attacker);
  return unitOrder.reduce((power, attackingUnit) => {
    const targetMultiplier = unitOrder.reduce(
      (weighted, defendingUnit) =>
        weighted +
        (defender[defendingUnit] / defenderTotal) * matchup[attackingUnit][defendingUnit],
      0,
    );
    const siegeMultiplier = siege ? unitProfiles[attackingUnit].siege : 1;
    return power + attacker[attackingUnit] * targetMultiplier * siegeMultiplier;
  }, 0);
};

const removeCasualties = (army: ArmyComposition, casualties: number) => {
  const total = armyTotal(army);
  return total <= 0 ? emptyArmy() : scaleArmy(army, Math.max(0, total - casualties) / total);
};

export const LEGION_CLASH_RATE = 12;

export const resolveArmyClash = (
  first: ArmyComposition,
  second: ArmyComposition,
  seconds: number,
) => {
  const pressureOnFirst = armyPower(second, first);
  const pressureOnSecond = armyPower(first, second);
  const pressure = pressureOnFirst + pressureOnSecond;
  if (pressure <= 0 || seconds <= 0) {
    return { first: cloneArmy(first), second: cloneArmy(second) };
  }
  const intensity = 2 * LEGION_CLASH_RATE * seconds;
  return {
    first: removeCasualties(first, (intensity * pressureOnFirst) / pressure),
    second: removeCasualties(second, (intensity * pressureOnSecond) / pressure),
  };
};

export interface LegionArrival {
  faction: Faction;
  army: ArmyComposition;
}

export const resolveArmyArrival = (
  targetFaction: Faction,
  targetKind: FortKind,
  targetArmy: ArmyComposition,
  attackerFaction: Faction,
  attackerArmy: ArmyComposition,
): LegionArrival => {
  if (targetFaction === attackerFaction) {
    return { faction: targetFaction, army: addArmies(targetArmy, attackerArmy) };
  }

  const attackerTotal = armyTotal(attackerArmy);
  const defenderTotal = armyTotal(targetArmy);
  if (attackerTotal <= 0) return { faction: targetFaction, army: cloneArmy(targetArmy) };
  if (defenderTotal <= 0) return { faction: attackerFaction, army: cloneArmy(attackerArmy) };

  const attackPower = armyPower(attackerArmy, targetArmy, true);
  const defensePower = armyPower(targetArmy, attackerArmy) * fortProfiles[targetKind].defense;

  if (defensePower >= attackPower) {
    const survival = Math.max(1 / defenderTotal, (defensePower - attackPower) / defensePower);
    return { faction: targetFaction, army: scaleArmy(targetArmy, survival) };
  }
  const survival = Math.max(1 / attackerTotal, (attackPower - defensePower) / attackPower);
  return { faction: attackerFaction, army: scaleArmy(attackerArmy, survival) };
};
