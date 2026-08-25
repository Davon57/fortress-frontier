export type Faction = "player" | "ai" | "neutral";

export interface FortressState {
  faction: Faction;
  soldiers: number;
  production: number;
}

export const dispatchRatio = (dragDistance: number) =>
  Math.max(0.1, Math.min(1, 0.1 + (dragDistance - 55) / 260 * 0.9));

export const dispatchCount = (soldiers: number, ratio: number) =>
  Math.max(0, Math.min(Math.max(0, soldiers - 1), Math.floor(soldiers * ratio)));

export const produce = (fortress: FortressState, seconds: number): FortressState => ({
  ...fortress,
  soldiers: fortress.faction === "neutral"
    ? fortress.soldiers
    : Math.min(90, fortress.soldiers + fortress.production * seconds),
});

export const resolveClash = (first: number, second: number, seconds: number) => {
  const losses = Math.max(1, Math.ceil(seconds * 12));
  return { first: Math.max(0, first - losses), second: Math.max(0, second - losses) };
};

export const resolveArrival = (target: FortressState, attacker: Faction, soldiers: number): FortressState => {
  if (target.faction === attacker) return { ...target, soldiers: target.soldiers + soldiers };
  const remaining = target.soldiers - soldiers;
  return remaining > 0
    ? { ...target, soldiers: remaining }
    : {
        ...target,
        faction: attacker,
        soldiers: Math.max(1, Math.abs(remaining)),
        production: attacker === "neutral" ? 0 : 1,
      };
};

export const winner = (fortresses: FortressState[]): Faction | null => {
  const factions = new Set(fortresses.map(fortress => fortress.faction).filter(faction => faction !== "neutral"));
  return factions.size === 1 && !fortresses.some(fortress => fortress.faction === "neutral")
    ? [...factions][0]!
    : null;
};
