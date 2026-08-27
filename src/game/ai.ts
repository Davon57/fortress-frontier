import type { AbilityId } from "./abilities";
import { fortProfiles } from "./logic";
import { createRoute, routeDistance } from "./navigation";
import type { Fort, Point, Squad } from "./types";

export interface AiOrder {
  from: number;
  to: number;
  ratio: number;
}

export type AiPersonality = "aggressive" | "guardian" | "expansionist";

interface AiPersonalityProfile {
  name: string;
  hint: string;
  ability: AbilityId;
  reserve: number;
  defenseUrgency: number;
  playerValue: number;
  neutralValue: number;
  productionWeight: number;
  objectiveValue: number;
  distanceScale: number;
  commitment: number;
  minimumScore: number;
}

export const aiPersonalities: Record<AiPersonality, AiPersonalityProfile> = {
  aggressive: {
    name: "猛攻型",
    hint: "偏好攻击玩家薄弱据点，出兵更果断",
    ability: "forcedMarch",
    reserve: 14,
    defenseUrgency: 1.5,
    playerValue: 16,
    neutralValue: 2,
    productionWeight: 3,
    objectiveValue: 20,
    distanceScale: 100,
    commitment: 1.08,
    minimumScore: -16,
  },
  guardian: {
    name: "守备型",
    hint: "优先救援受威胁堡垒，稳守战略目标",
    ability: "bulwark",
    reserve: 24,
    defenseUrgency: 3.2,
    playerValue: 8,
    neutralValue: 3,
    productionWeight: 4,
    objectiveValue: 24,
    distanceScale: 75,
    commitment: 0.88,
    minimumScore: -8,
  },
  expansionist: {
    name: "扩张型",
    hint: "优先争夺中立高产堡垒，快速铺开兵源",
    ability: "conscription",
    reserve: 16,
    defenseUrgency: 2,
    playerValue: 5,
    neutralValue: 15,
    productionWeight: 5.5,
    objectiveValue: 18,
    distanceScale: 110,
    commitment: 0.95,
    minimumScore: -18,
  },
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export const chooseAiOrder = (
  forts: readonly Fort[],
  waypoints: readonly Point[],
  squads: readonly Squad[] = [],
  personality: AiPersonality = "aggressive",
  priorityTargets: readonly number[] = [],
): AiOrder | null => {
  const strategy = aiPersonalities[personality];
  let defense: { order: AiOrder; score: number } | null = null;
  for (let to = 0; to < forts.length; to++) {
    const target = forts[to];
    if (target.faction !== "ai") continue;
    const incoming = squads
      .filter((squad) => squad.faction === "player" && squad.to === to)
      .reduce((total, squad) => total + squad.soldiers, 0);
    const danger = incoming - target.soldiers * fortProfiles[target.kind].defense * 0.75;
    if (danger <= 0) continue;

    for (let from = 0; from < forts.length; from++) {
      const source = forts[from];
      if (from === to || source.faction !== "ai" || source.soldiers <= strategy.reserve + 6)
        continue;
      const travel = routeDistance(createRoute(source, target, waypoints));
      const objectiveBonus = priorityTargets.includes(to) ? strategy.objectiveValue : 0;
      const score =
        danger * strategy.defenseUrgency +
        source.soldiers +
        objectiveBonus -
        travel / strategy.distanceScale;
      if (!defense || score > defense.score) {
        const ratio = clamp(((danger + 10) / source.soldiers) * strategy.commitment, 0.32, 0.92);
        defense = { order: { from, to, ratio }, score };
      }
    }
  }
  if (defense) return defense.order;

  let best: { order: AiOrder; score: number } | null = null;

  for (let from = 0; from < forts.length; from++) {
    const source = forts[from];
    if (source.faction !== "ai" || source.soldiers <= strategy.reserve) continue;

    for (let to = 0; to < forts.length; to++) {
      const target = forts[to];
      if (target.faction === "ai") continue;

      const profile = fortProfiles[target.kind];
      const garrison = target.soldiers * profile.defense;
      const committed = squads
        .filter((squad) => squad.faction === "ai" && squad.to === to)
        .reduce((total, squad) => total + squad.soldiers, 0);
      if (committed >= garrison) continue;

      const travel = routeDistance(createRoute(source, target, waypoints));
      const available = source.soldiers - 1;
      const required = garrison - committed + 1;
      const advantage = available * 0.75 - required;
      const factionValue =
        target.faction === "player" ? strategy.playerValue : strategy.neutralValue;
      const objectiveBonus = priorityTargets.includes(to) ? strategy.objectiveValue : 0;
      const strategicValue =
        profile.production * strategy.productionWeight + factionValue + objectiveBonus;
      const score = advantage * 1.35 + strategicValue - travel / strategy.distanceScale;

      if (!best || score > best.score) {
        const ratio = clamp(((required + 7) / source.soldiers) * strategy.commitment, 0.34, 0.96);
        best = { order: { from, to, ratio }, score };
      }
    }
  }

  return best && best.score > strategy.minimumScore ? best.order : null;
};
