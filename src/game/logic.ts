export type Faction = "player" | "ai" | "neutral";

export type FortKind = "barracks" | "fortress" | "outpost";

export interface FortProfile {
  name: string;
  /** 每秒产兵 */
  production: number;
  /** 驻军自然增长的上限，超出部分靠增援堆叠，不会被削减 */
  capacity: number;
  /** 守军战力倍率，攻方需要打穿 soldiers × defense 才能夺城 */
  defense: number;
}

export const fortProfiles: Record<FortKind, FortProfile> = {
  barracks: { name: "兵营", production: 2, capacity: 60, defense: 1 },
  fortress: { name: "要塞", production: 0.7, capacity: 120, defense: 1.6 },
  outpost: { name: "哨站", production: 1, capacity: 45, defense: 1.2 },
};

export interface FortressState {
  faction: Faction;
  soldiers: number;
  kind: FortKind;
}

export interface ClashUnit {
  faction: Faction;
  soldiers: number;
  x: number;
  y: number;
}

export const MIN_DISPATCH_RATIO = 0.05;
export const DISPATCH_PRESETS = [0.25, 0.5, 0.75, 1] as const;

export const clampDispatchRatio = (ratio: number) =>
  Number.isFinite(ratio) ? Math.max(MIN_DISPATCH_RATIO, Math.min(1, ratio)) : MIN_DISPATCH_RATIO;

export const dispatchCount = (soldiers: number, ratio: number) =>
  Math.max(0, Math.min(Math.max(0, soldiers - 1), Math.floor(soldiers * ratio)));

export const produce = (fortress: FortressState, seconds: number): FortressState => {
  const { production, capacity } = fortProfiles[fortress.kind];
  if (fortress.faction === "neutral" || fortress.soldiers >= capacity) return fortress;
  return {
    ...fortress,
    soldiers: Math.min(capacity, fortress.soldiers + production * seconds),
  };
};

/** 势均力敌时双方各损失约 12/秒；兵力越占优，己方损耗越低。 */
export const CLASH_RATE = 12;

export const resolveClash = (first: number, second: number, seconds: number) => {
  const total = first + second;
  if (total <= 0 || seconds <= 0) {
    return { first: Math.max(0, first), second: Math.max(0, second) };
  }
  const intensity = 2 * CLASH_RATE * seconds;
  return {
    first: Math.max(0, first - (intensity * second) / total),
    second: Math.max(0, second - (intensity * first) / total),
  };
};

/**
 * 半径内每一对敌对军团都会结算一次，损耗按对累加，
 * 因此多支部队围攻同一目标是有效的。
 */
export const resolveNearbyClashes = <T extends ClashUnit>(
  units: readonly T[],
  seconds: number,
  radius = 28,
): T[] => {
  const result = units.map((unit) => ({ ...unit }));
  const buckets = new Map<string, number[]>();
  const cell = (value: number) => Math.floor(value / radius);

  result.forEach((unit, index) => {
    if (unit.soldiers <= 0) return;
    const key = `${cell(unit.x)},${cell(unit.y)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  });

  const losses = new Array<number>(result.length).fill(0);

  result.forEach((unit, index) => {
    if (unit.soldiers <= 0) return;
    const cellX = cell(unit.x);
    const cellY = cell(unit.y);

    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (const candidate of buckets.get(`${cellX + offsetX},${cellY + offsetY}`) ?? []) {
          const enemy = result[candidate];
          if (candidate <= index || enemy.faction === unit.faction) continue;
          if (Math.hypot(unit.x - enemy.x, unit.y - enemy.y) >= radius) continue;
          const clash = resolveClash(unit.soldiers, enemy.soldiers, seconds);
          losses[index] += unit.soldiers - clash.first;
          losses[candidate] += enemy.soldiers - clash.second;
        }
      }
    }
  });

  for (let index = 0; index < result.length; index++) {
    if (losses[index] > 0) {
      result[index].soldiers = Math.max(0, result[index].soldiers - losses[index]);
    }
  }

  return result;
};

export const resolveArrival = (
  target: FortressState,
  attacker: Faction,
  soldiers: number,
  defenseMultiplier = 1,
): FortressState => {
  if (target.faction === attacker) return { ...target, soldiers: target.soldiers + soldiers };
  const defense = fortProfiles[target.kind].defense * defenseMultiplier;
  const garrison = target.soldiers * defense;
  return garrison > soldiers
    ? { ...target, soldiers: (garrison - soldiers) / defense }
    : { ...target, faction: attacker, soldiers: Math.max(1, soldiers - garrison) };
};

export interface MarchingForce {
  faction: Faction;
  soldiers: number;
}

/** 一方只有在既无堡垒、也无在途部队时才算被消灭。 */
export const winner = (
  fortresses: readonly FortressState[],
  marching: readonly MarchingForce[] = [],
): Faction | null => {
  const factions = new Set<Faction>();
  for (const fortress of fortresses) {
    if (fortress.faction !== "neutral") factions.add(fortress.faction);
  }
  for (const force of marching) {
    if (force.faction !== "neutral" && force.soldiers > 0) factions.add(force.faction);
  }
  return factions.size === 1 ? [...factions][0]! : null;
};
