import { fortProfiles } from "./logic";
import { addArmies, armyPower, armyTotal, emptyArmy, unitProfiles } from "./legion-logic";
import type { LegionFort } from "./legion-levels";
import { createRoute, routeDistance } from "./navigation";
import type { ArmyComposition, Point } from "./types";

export interface LegionAiSquad {
  faction: "player" | "ai";
  to: number;
  army: ArmyComposition;
}

export interface LegionAiOrder {
  from: number;
  to: number;
  ratio: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const incomingArmy = (squads: readonly LegionAiSquad[], faction: "player" | "ai", target: number) =>
  squads
    .filter((squad) => squad.faction === faction && squad.to === target)
    .reduce((army, squad) => addArmies(army, squad.army), emptyArmy());

export const chooseLegionAiOrder = (
  forts: readonly LegionFort[],
  waypoints: readonly Point[],
  squads: readonly LegionAiSquad[] = [],
): LegionAiOrder | null => {
  let defense: { order: LegionAiOrder; score: number } | null = null;

  for (let to = 0; to < forts.length; to++) {
    const target = forts[to];
    if (target.faction !== "ai") continue;
    const threat = incomingArmy(squads, "player", to);
    const threatTotal = armyTotal(threat);
    if (threatTotal <= 0) continue;

    for (let from = 0; from < forts.length; from++) {
      const source = forts[from];
      const sourceTotal = armyTotal(source.army);
      if (from === to || source.faction !== "ai" || sourceTotal <= 18) continue;
      const counterPower = armyPower(source.army, threat);
      const travel = routeDistance(createRoute(source, target, waypoints));
      const score = counterPower + sourceTotal * 0.5 - travel / 70;
      if (!defense || score > defense.score) {
        defense = {
          order: {
            from,
            to,
            ratio: clamp((threatTotal + 8) / sourceTotal, 0.35, 0.85),
          },
          score,
        };
      }
    }
  }
  if (defense) return defense.order;

  let best: { order: LegionAiOrder; score: number } | null = null;
  for (let from = 0; from < forts.length; from++) {
    const source = forts[from];
    const sourceTotal = armyTotal(source.army);
    if (source.faction !== "ai" || sourceTotal <= 14) continue;

    for (let to = 0; to < forts.length; to++) {
      const target = forts[to];
      if (target.faction === "ai") continue;

      const attackPower = armyPower(source.army, target.army, true);
      const defensePower = armyPower(target.army, source.army) * fortProfiles[target.kind].defense;
      const committed = armyTotal(incomingArmy(squads, "ai", to));
      if (committed >= armyTotal(target.army) * 1.15) continue;

      const travel = routeDistance(createRoute(source, target, waypoints));
      const matchupQuality = attackPower / Math.max(1, sourceTotal);
      const productionValue = unitProfiles[target.specialization].production * 5;
      const factionValue = target.faction === "player" ? 11 : 6;
      const score =
        attackPower * 0.72 -
        defensePower +
        committed * 0.8 +
        matchupQuality * 10 +
        productionValue +
        factionValue -
        travel / 85;

      if (!best || score > best.score) {
        best = {
          order: {
            from,
            to,
            ratio: clamp(defensePower / Math.max(1, attackPower) + 0.18, 0.36, 0.94),
          },
          score,
        };
      }
    }
  }

  return best && best.score > -22 ? best.order : null;
};
