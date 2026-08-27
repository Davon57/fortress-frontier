import {
  abilityProfiles,
  abilityReadiness,
  BARRAGE_DAMAGE,
  BULWARK_DEFENSE,
  CONSCRIPTION_BONUS,
  createAbilityRuntime,
  MARCH_SPEED_BONUS,
  type AbilityFaction,
  type AbilityId,
  type AbilityOutcome,
  type AbilityRuntime,
  type ActiveEffect,
} from "./abilities";
import { chooseAiOrder } from "./ai";
import type { Level } from "./levels";
import {
  clampDispatchRatio,
  dispatchCount,
  produce,
  resolveArrival,
  resolveNearbyClashes,
  winner,
  type Faction,
} from "./logic";
import { createRoute } from "./navigation";
import {
  advanceObjective,
  createObjectiveRuntime,
  finishObjective,
  getObjectiveView,
  type BattleOutcome,
  type ObjectiveRuntime,
} from "./objectives";
import { createBattleStats } from "./scoring";
import { terrainEffects } from "./terrain";
import type { Fort, Squad } from "./types";

/** 出兵失败的原因需要区分开，界面才能给出准确的提示。 */
export type OrderOutcome = "sent" | "unavailable" | "invalid-target" | "insufficient";

export class GameSimulation {
  readonly forts: Fort[];
  readonly squads: Squad[] = [];
  readonly abilities = createAbilityRuntime();
  readonly effects: ActiveEffect[] = [];
  readonly objective: ObjectiveRuntime;
  readonly aiAbility: { id: AbilityId; state: AbilityRuntime } | null;
  readonly stats = createBattleStats();
  ended = false;
  endReason = "";
  paused = false;
  speed: 1 | 2 = 1;
  dispatchRatio = 0.5;
  private aiTimer = 1.8;

  constructor(readonly level: Level) {
    this.forts = level.forts.map((fort) => ({ ...fort }));
    this.objective = createObjectiveRuntime(this.forts);
    this.aiAbility = level.aiAbility
      ? {
          id: level.aiAbility,
          state: {
            charges: Math.min(2, abilityProfiles[level.aiAbility].charges),
            cooldown: 10 + level.id * 0.5,
          },
        }
      : null;
  }

  fortAt(x: number, y: number) {
    return this.forts.findIndex((fort) => Math.hypot(fort.x - x, fort.y - y) < 43);
  }

  squadAt(x: number, y: number, radius = 30) {
    let found = -1;
    let closest = radius;
    for (let index = 0; index < this.squads.length; index++) {
      const squad = this.squads[index];
      if (squad.soldiers <= 0) continue;
      const distance = Math.hypot(squad.x - x, squad.y - y);
      if (distance < closest) {
        found = index;
        closest = distance;
      }
    }
    return found;
  }

  /** 玩家部队当前每秒行进的像素数，供路线预览估算抵达时间。 */
  get playerPace() {
    return (
      54 * this.level.speed * (this.hasEffect("forcedMarch") ? MARCH_SPEED_BONUS : 1) * this.speed
    );
  }

  /** 当前受坚壁保护的堡垒序号，供渲染层显示护盾。 */
  get shieldedForts() {
    return this.effects
      .filter((effect) => effect.ability === "bulwark")
      .map((effect) => effect.fort);
  }

  get objectiveView() {
    return getObjectiveView(this.level.objective, this.objective, this.forts);
  }

  togglePaused() {
    if (!this.ended) this.paused = !this.paused;
    return this.paused;
  }

  setSpeed(speed: 1 | 2) {
    this.speed = speed;
  }

  setDispatchRatio(ratio: number) {
    this.dispatchRatio = clampDispatchRatio(ratio);
    return this.dispatchRatio;
  }

  order(from: number, to: number, ratio: number = this.dispatchRatio): OrderOutcome {
    if (this.ended || this.paused) return "unavailable";
    const source = this.forts[from];
    const target = this.forts[to];
    if (!source || !target || from === to || source.faction === "neutral") return "invalid-target";
    const soldiers = dispatchCount(source.soldiers, clampDispatchRatio(ratio));
    if (!soldiers) return "insufficient";
    if (source.faction === "player") {
      this.stats.orders += 1;
      this.stats.soldiersDispatched += soldiers;
    }
    source.soldiers -= soldiers;
    const route = createRoute(source, target, this.level.waypoints);
    this.squads.push({
      from,
      to,
      faction: source.faction,
      soldiers,
      phase: Math.random() * Math.PI * 2,
      x: route[0].x,
      y: route[0].y,
      route,
      next: 1,
    });
    return "sent";
  }

  /** fort 为 -1 时只查询全局增益；传入堡垒序号可一并命中作用于该堡垒的增益。 */
  hasEffect(ability: AbilityId, fort = -1) {
    return this.hasFactionEffect(ability, "player", fort);
  }

  private hasFactionEffect(ability: AbilityId, faction: AbilityFaction, fort = -1) {
    return this.effects.some(
      (effect) =>
        effect.ability === ability &&
        effect.faction === faction &&
        (effect.fort === -1 || effect.fort === fort),
    );
  }

  castAbility(ability: AbilityId, target = -1): AbilityOutcome {
    if (this.ended || this.paused) return "unavailable";
    const outcome = this.castForFaction("player", ability, target, this.abilities[ability]);
    if (outcome === "cast") this.stats.abilitiesUsed += 1;
    return outcome;
  }

  private castForFaction(
    faction: AbilityFaction,
    ability: AbilityId,
    target: number,
    state: AbilityRuntime,
  ): AbilityOutcome {
    const readiness = abilityReadiness(state);
    if (readiness !== "cast") return readiness;

    const profile = abilityProfiles[ability];
    if (profile.targeting === "squad") {
      const squad = this.squads[target];
      if (!squad || squad.faction === faction || squad.soldiers <= 0) return "invalid-target";
      const before = squad.soldiers;
      squad.soldiers = Math.max(0, squad.soldiers * (1 - BARRAGE_DAMAGE));
      if (squad.faction === "player") this.stats.casualties += before - squad.soldiers;
    } else if (profile.targeting === "fort") {
      const fort = this.forts[target];
      if (!fort || fort.faction !== faction) return "invalid-target";
    }

    state.charges -= 1;
    state.cooldown = profile.cooldown;
    if (profile.duration > 0) {
      this.effects.push({
        ability,
        remaining: profile.duration,
        faction,
        fort: profile.targeting === "fort" ? target : -1,
      });
    }
    return "cast";
  }

  private advanceAbilities(elapsed: number) {
    for (const state of Object.values(this.abilities)) {
      if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - elapsed);
    }
    if (this.aiAbility?.state.cooldown && this.aiAbility.state.cooldown > 0) {
      this.aiAbility.state.cooldown = Math.max(0, this.aiAbility.state.cooldown - elapsed);
    }
    for (let index = this.effects.length - 1; index >= 0; index--) {
      this.effects[index].remaining -= elapsed;
      if (this.effects[index].remaining <= 0) this.effects.splice(index, 1);
    }
  }

  private tryCastAiAbility() {
    const command = this.aiAbility;
    if (!command || abilityReadiness(command.state) !== "cast") return;

    let target = -1;
    if (command.id === "forcedMarch") {
      if (!this.squads.some((squad) => squad.faction === "ai" && squad.soldiers > 0)) return;
    } else if (command.id === "conscription") {
      if (!this.forts.some((fort) => fort.faction === "ai")) return;
    } else if (command.id === "barrage") {
      let largest = 0;
      for (let index = 0; index < this.squads.length; index++) {
        const squad = this.squads[index];
        if (squad.faction === "player" && squad.soldiers > largest) {
          target = index;
          largest = squad.soldiers;
        }
      }
      if (target < 0) return;
    } else {
      let greatestThreat = 0;
      for (let index = 0; index < this.forts.length; index++) {
        if (this.forts[index].faction !== "ai") continue;
        const incoming = this.squads
          .filter((squad) => squad.faction === "player" && squad.to === index)
          .reduce((total, squad) => total + squad.soldiers, 0);
        if (incoming > greatestThreat) {
          target = index;
          greatestThreat = incoming;
        }
      }
      if (target < 0) return;
    }

    this.castForFaction("ai", command.id, target, command.state);
  }

  private conclude(outcome: BattleOutcome, reason: string) {
    if (!this.objective.outcome) finishObjective(this.objective, outcome, reason);
    this.endReason = this.objective.message || reason;
    this.ended = true;
    return outcome;
  }

  update(seconds: number): Faction | null {
    if (this.ended || this.paused) return null;
    const elapsed = seconds * this.speed;
    const terrain = terrainEffects[this.level.biome];
    this.stats.elapsed += elapsed;
    this.advanceAbilities(elapsed);

    for (let index = 0; index < this.forts.length; index++) {
      const fort = this.forts[index];
      const boost =
        fort.faction !== "neutral" && this.hasFactionEffect("conscription", fort.faction, index)
          ? CONSCRIPTION_BONUS
          : 1;
      this.forts[index] = {
        ...fort,
        ...produce(fort, elapsed * terrain.production * boost),
      };
    }

    for (const squad of this.squads) {
      const target = squad.route[squad.next];
      const dx = target.x - squad.x;
      const dy = target.y - squad.y;
      const distance = Math.hypot(dx, dy);
      const marchBonus =
        squad.faction !== "neutral" && this.hasFactionEffect("forcedMarch", squad.faction)
          ? MARCH_SPEED_BONUS
          : 1;
      const pace = 54 * this.level.speed * marchBonus;
      const step = Math.min(distance, elapsed * pace);
      if (distance > 0) {
        squad.x += (dx / distance) * step;
        squad.y += (dy / distance) * step;
      }
      if (distance <= step + 0.01) squad.next += 1;
      squad.phase += elapsed;
    }

    const resolved = resolveNearbyClashes(this.squads, elapsed * terrain.combat);
    for (let index = 0; index < this.squads.length; index++) {
      if (this.squads[index].faction === "player") {
        this.stats.casualties += Math.max(
          0,
          this.squads[index].soldiers - resolved[index].soldiers,
        );
      }
      this.squads[index].soldiers = resolved[index].soldiers;
    }

    for (let index = this.squads.length - 1; index >= 0; index--) {
      const squad = this.squads[index];
      if (squad.soldiers <= 0) {
        this.squads.splice(index, 1);
      } else if (squad.next >= squad.route.length) {
        const before = this.forts[squad.to];
        const defender = before.faction;
        const shielded =
          defender !== "neutral" && this.hasFactionEffect("bulwark", defender, squad.to);
        const after = {
          ...before,
          ...resolveArrival(before, squad.faction, squad.soldiers, shielded ? BULWARK_DEFENSE : 1),
        };
        if (squad.faction === "player" && before.faction !== "player") {
          const survivors = after.faction === "player" ? after.soldiers : 0;
          this.stats.casualties += Math.max(0, squad.soldiers - survivors);
        } else if (squad.faction !== "player" && before.faction === "player") {
          const survivors = after.faction === "player" ? after.soldiers : 0;
          this.stats.casualties += Math.max(0, before.soldiers - survivors);
          if (after.faction !== "player") this.stats.fortsLost += 1;
        }
        this.forts[squad.to] = after;
        this.squads.splice(index, 1);
      }
    }

    const domination = winner(this.forts, this.squads);
    if (domination === "player") {
      return this.conclude("player", "敌军已无堡垒或在途部队。");
    }
    if (domination === "ai") {
      return this.conclude("ai", "我方已无堡垒或在途部队。");
    }

    const objectiveResult = advanceObjective(
      this.level.objective,
      this.objective,
      this.forts,
      this.squads,
      elapsed,
    );
    if (objectiveResult) return this.conclude(objectiveResult, this.objective.message);

    this.tryCastAiAbility();
    this.aiTimer -= elapsed;
    if (this.aiTimer <= 0) {
      this.aiTimer = this.level.aiDelay + Math.random();
      const decision = chooseAiOrder(
        this.forts,
        this.level.waypoints,
        this.squads,
        this.level.aiPersonality,
        this.objectiveView.targetForts,
      );
      if (decision) this.order(decision.from, decision.to, decision.ratio);
    }

    return null;
  }
}
