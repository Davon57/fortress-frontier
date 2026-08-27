import { chooseLegionAiOrder } from "./legion-ai";
import {
  addArmies,
  armyOf,
  armyTotal,
  cloneArmy,
  dispatchArmy,
  emptyArmy,
  matchup,
  produceArmy,
  resolveArmyArrival,
  resolveArmyClash,
  unitOrder,
  unitProfiles,
} from "./legion-logic";
import type { LegionFort, LegionLevel } from "./legion-levels";
import { clampDispatchRatio, fortProfiles, type Faction } from "./logic";
import { createRoute } from "./navigation";
import type { ObjectiveView } from "./objectives";
import { terrainEffects } from "./terrain";
import type { Fort, Point, Squad, UnitStance, UnitType } from "./types";

export type LegionOrderOutcome = "sent" | "unavailable" | "invalid-target" | "insufficient";

export interface LegionSquad extends Point {
  from: number;
  targetFort: number | null;
  faction: "player" | "ai";
  unit: UnitType;
  soldiers: number;
  phase: number;
  route: Point[];
  next: number;
  stance: UnitStance;
  attackCooldown: number;
  charge: number;
  chargeCooldown: number;
}

export interface LegionProjectile {
  from: Point;
  to: Point;
  remaining: number;
  duration: number;
}

const ARCHER_RANGE = 150;
const ARCHER_VOLLEY = 1.15;
const INFANTRY_COVER_RANGE = 58;
const FORMATION_LANE: Record<UnitType, number> = {
  infantry: -13,
  archer: 0,
  cavalry: 13,
};

export class LegionSimulation {
  readonly forts: LegionFort[];
  readonly squads: LegionSquad[] = [];
  readonly projectiles: LegionProjectile[] = [];
  ended = false;
  endReason = "";
  paused = false;
  speed: 1 | 2 = 1;
  dispatchRatio = 0.5;
  elapsed = 0;
  private aiTimer = 1.6;
  private readonly initialAiForts: number;

  constructor(readonly level: LegionLevel) {
    this.forts = level.forts.map((fort) => ({
      ...fort,
      army: cloneArmy(fort.army),
    }));
    this.initialAiForts = this.forts.filter((fort) => fort.faction === "ai").length;
  }

  get renderForts(): Fort[] {
    return this.forts.map((fort) => ({
      x: fort.x,
      y: fort.y,
      faction: fort.faction,
      kind: fort.kind,
      soldiers: armyTotal(fort.army),
      composition: cloneArmy(fort.army),
      specialization: fort.specialization,
    }));
  }

  get renderSquads(): Squad[] {
    return this.squads.map((squad) => ({
      x: squad.x,
      y: squad.y,
      from: squad.from,
      to: squad.targetFort ?? squad.from,
      faction: squad.faction,
      soldiers: squad.soldiers,
      composition: armyOf(squad.unit, squad.soldiers),
      unitType: squad.unit,
      stance: squad.stance,
      phase: squad.phase,
      route: squad.route,
      next: squad.next,
    }));
  }

  get playerPace() {
    return 54 * this.level.speed * this.speed;
  }

  get objectiveView(): ObjectiveView {
    const remaining = this.forts.filter((fort) => fort.faction === "ai").length;
    const defeated = Math.max(0, this.initialAiForts - remaining);
    const state = this.ended ? (remaining === 0 ? "complete" : "failed") : "active";
    return {
      title: "胜利目标：消灭敌军全部军团与堡垒",
      detail: this.ended
        ? this.endReason
        : `已夺取 ${defeated} / ${this.initialAiForts} 座敌方初始堡垒`,
      progress: this.initialAiForts > 0 ? defeated / this.initialAiForts : 1,
      state,
      targetForts: [],
    };
  }

  fortAt(x: number, y: number) {
    return this.forts.findIndex((fort) => Math.hypot(fort.x - x, fort.y - y) < 43);
  }

  squadAt(x: number, y: number, radius = 34) {
    let found = -1;
    let closest = radius;
    for (let index = 0; index < this.squads.length; index++) {
      const squad = this.squads[index];
      if (squad.faction !== "player" || squad.soldiers <= 0) continue;
      const distance = Math.hypot(squad.x - x, squad.y - y);
      if (distance < closest) {
        found = index;
        closest = distance;
      }
    }
    return found;
  }

  forceSummary(faction: "player" | "ai") {
    const stationed = this.forts
      .filter((fort) => fort.faction === faction)
      .map((fort) => fort.army);
    const marching = this.squads
      .filter((squad) => squad.faction === faction)
      .map((squad) => armyOf(squad.unit, squad.soldiers));
    return [...stationed, ...marching].reduce((total, army) => addArmies(total, army), emptyArmy());
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

  private destination(target: number | Point) {
    return typeof target === "number"
      ? { point: this.forts[target], fort: target }
      : { point: target, fort: null };
  }

  private formationRoute(
    start: Point,
    destination: Point,
    unit: UnitType,
    targetFort: number | null,
  ) {
    const route = createRoute(start, destination, this.level.waypoints);
    const dx = destination.x - start.x;
    const dy = destination.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const offset = FORMATION_LANE[unit];
    const offsetX = (-dy / length) * offset;
    const offsetY = (dx / length) * offset;
    return route.map((point, index) => {
      if (targetFort !== null && index === route.length - 1) return { ...point };
      return { x: point.x + offsetX, y: point.y + offsetY };
    });
  }

  order(from: number, target: number | Point, ratio = this.dispatchRatio): LegionOrderOutcome {
    if (this.ended || this.paused) return "unavailable";
    const source = this.forts[from];
    const destination = this.destination(target);
    if (
      !source ||
      !destination.point ||
      (destination.fort === from && destination.fort !== null) ||
      source.faction === "neutral"
    ) {
      return "invalid-target";
    }
    const dispatched = dispatchArmy(source.army, clampDispatchRatio(ratio));
    if (armyTotal(dispatched.sent) <= 0) return "insufficient";
    source.army = dispatched.remaining;

    for (const unit of unitOrder) {
      const soldiers = dispatched.sent[unit];
      if (soldiers <= 0.05) continue;
      const route = this.formationRoute(source, destination.point, unit, destination.fort);
      this.squads.push({
        from,
        targetFort: destination.fort,
        faction: source.faction,
        unit,
        soldiers,
        phase: Math.random() * Math.PI * 2,
        x: route[0].x,
        y: route[0].y,
        route,
        next: 1,
        stance: unit === "cavalry" ? "charging" : "moving",
        attackCooldown: Math.random() * ARCHER_VOLLEY,
        charge: 0,
        chargeCooldown: 0,
      });
    }
    return "sent";
  }

  redirect(squadIndex: number, target: number | Point): LegionOrderOutcome {
    if (this.ended || this.paused) return "unavailable";
    const squad = this.squads[squadIndex];
    const destination = this.destination(target);
    if (!squad || squad.faction !== "player" || !destination.point) {
      return "invalid-target";
    }
    squad.route = this.formationRoute(squad, destination.point, squad.unit, destination.fort);
    squad.next = 1;
    squad.targetFort = destination.fort;
    squad.stance = squad.unit === "cavalry" ? "charging" : "moving";
    return "sent";
  }

  private nearestEnemy(squad: LegionSquad, range: number) {
    let target = -1;
    let closest = range;
    for (let index = 0; index < this.squads.length; index++) {
      const candidate = this.squads[index];
      if (candidate.faction === squad.faction || candidate.soldiers <= 0) {
        continue;
      }
      const distance = Math.hypot(squad.x - candidate.x, squad.y - candidate.y);
      if (distance < closest) {
        target = index;
        closest = distance;
      }
    }
    return target;
  }

  private hasInfantryCover(target: LegionSquad) {
    if (target.unit === "infantry" && target.stance === "shield") return true;
    return this.squads.some(
      (squad) =>
        squad !== target &&
        squad.faction === target.faction &&
        squad.unit === "infantry" &&
        squad.stance === "shield" &&
        squad.soldiers > 0 &&
        Math.hypot(squad.x - target.x, squad.y - target.y) < INFANTRY_COVER_RANGE,
    );
  }

  private fireVolley(archer: LegionSquad, target: LegionSquad) {
    const effectiveness = matchup.archer[target.unit];
    const cover = this.hasInfantryCover(target) ? 0.5 : 1;
    const casualties = Math.max(0.7, archer.soldiers * 0.12 * effectiveness * cover);
    target.soldiers = Math.max(0, target.soldiers - casualties);
    this.projectiles.push({
      from: { x: archer.x, y: archer.y - 4 },
      to: { x: target.x, y: target.y },
      remaining: 0.35,
      duration: 0.35,
    });
  }

  private advanceSquad(squad: LegionSquad, elapsed: number) {
    squad.attackCooldown = Math.max(0, squad.attackCooldown - elapsed);
    squad.chargeCooldown = Math.max(0, squad.chargeCooldown - elapsed);

    if (squad.unit === "archer") {
      const targetIndex = this.nearestEnemy(squad, ARCHER_RANGE);
      if (targetIndex >= 0) {
        squad.stance = "firing";
        if (squad.attackCooldown <= 0) {
          this.fireVolley(squad, this.squads[targetIndex]);
          squad.attackCooldown = ARCHER_VOLLEY;
        }
        squad.phase += elapsed;
        return;
      }
    }

    if (squad.next >= squad.route.length) {
      squad.stance = squad.unit === "infantry" ? "shield" : "moving";
      squad.phase += elapsed;
      return;
    }

    const target = squad.route[squad.next];
    const dx = target.x - squad.x;
    const dy = target.y - squad.y;
    const distance = Math.hypot(dx, dy);
    const pace = 54 * this.level.speed * unitProfiles[squad.unit].speed;
    const step = Math.min(distance, elapsed * pace);
    if (distance > 0) {
      squad.x += (dx / distance) * step;
      squad.y += (dy / distance) * step;
    }
    if (distance <= step + 0.01) squad.next += 1;

    if (squad.unit === "cavalry") {
      if (squad.chargeCooldown <= 0) {
        squad.charge = Math.min(1, squad.charge + elapsed / 1.25);
      }
      squad.stance = squad.charge >= 0.7 ? "charging" : "moving";
    } else {
      squad.stance = "moving";
    }
    squad.phase += elapsed;
  }

  private applyCharge(attacker: LegionSquad, defender: LegionSquad) {
    if (attacker.unit !== "cavalry" || attacker.charge < 0.7 || attacker.chargeCooldown > 0) {
      return;
    }
    const shielded = defender.unit === "infantry" && defender.stance === "shield";
    const casualties =
      attacker.soldiers *
      0.18 *
      matchup.cavalry[defender.unit] *
      attacker.charge *
      (shielded ? 0.45 : 1);
    defender.soldiers = Math.max(0, defender.soldiers - casualties);
    attacker.charge = 0;
    attacker.chargeCooldown = 2.5;
  }

  private resolveFieldBattle(elapsed: number) {
    for (let first = 0; first < this.squads.length; first++) {
      for (let second = first + 1; second < this.squads.length; second++) {
        const left = this.squads[first];
        const right = this.squads[second];
        if (left.faction === right.faction) continue;
        if (Math.hypot(left.x - right.x, left.y - right.y) >= 28) continue;
        this.applyCharge(left, right);
        this.applyCharge(right, left);
        const clash = resolveArmyClash(
          armyOf(left.unit, left.soldiers),
          armyOf(right.unit, right.soldiers),
          elapsed * terrainEffects[this.level.biome].combat,
        );
        left.soldiers = armyTotal(clash.first);
        right.soldiers = armyTotal(clash.second);
      }
    }
  }

  private resolveArrivals() {
    for (let index = this.squads.length - 1; index >= 0; index--) {
      const squad = this.squads[index];
      if (squad.soldiers <= 0.05) {
        this.squads.splice(index, 1);
        continue;
      }
      if (squad.next < squad.route.length || squad.targetFort === null) {
        continue;
      }
      const target = this.forts[squad.targetFort];
      const arrival = resolveArmyArrival(
        target.faction,
        target.kind,
        target.army,
        squad.faction,
        armyOf(squad.unit, squad.soldiers),
      );
      target.faction = arrival.faction;
      target.army = arrival.army;
      this.squads.splice(index, 1);
    }
  }

  private outcome(): "player" | "ai" | null {
    const factions = new Set<Faction>();
    for (const fort of this.forts) {
      if (fort.faction !== "neutral") factions.add(fort.faction);
    }
    for (const squad of this.squads) {
      if (squad.soldiers > 0) factions.add(squad.faction);
    }
    if (factions.size !== 1) return null;
    const winner = [...factions][0];
    return winner === "player" || winner === "ai" ? winner : null;
  }

  update(seconds: number): "player" | "ai" | null {
    if (this.ended || this.paused) return null;
    const elapsed = seconds * this.speed;
    const terrain = terrainEffects[this.level.biome];
    this.elapsed += elapsed;

    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      this.projectiles[index].remaining -= elapsed;
      if (this.projectiles[index].remaining <= 0) {
        this.projectiles.splice(index, 1);
      }
    }

    for (const fort of this.forts) {
      if (fort.faction === "neutral") continue;
      fort.army = produceArmy(
        fort.army,
        fort.specialization,
        elapsed * terrain.production,
        fortProfiles[fort.kind].capacity,
      );
    }

    for (const squad of this.squads) this.advanceSquad(squad, elapsed);
    this.resolveFieldBattle(elapsed);
    this.resolveArrivals();

    const result = this.outcome();
    if (result) {
      this.ended = true;
      this.endReason = result === "player" ? "敌军军团已被彻底击溃。" : "我方已无堡垒或在途军团。";
      return result;
    }

    this.aiTimer -= elapsed;
    if (this.aiTimer <= 0) {
      this.aiTimer = this.level.aiDelay + Math.random() * 0.7;
      const aiSquads = this.squads.map((squad) => ({
        faction: squad.faction,
        to: squad.targetFort ?? squad.from,
        army: armyOf(squad.unit, squad.soldiers),
      }));
      const decision = chooseLegionAiOrder(this.forts, this.level.waypoints, aiSquads);
      if (decision) this.order(decision.from, decision.to, decision.ratio);
    }
    return null;
  }
}
