import { describe, expect, it } from "vitest";
import { chooseLegionAiOrder } from "./legion-ai";
import {
  armyOf,
  armyPower,
  armyTotal,
  dispatchArmy,
  produceArmy,
  resolveArmyArrival,
} from "./legion-logic";
import { getLegionLevel, type LegionLevel } from "./legion-levels";
import { LegionSimulation } from "./legion-simulation";

describe("军团模式", () => {
  it("步兵、骑兵和弓兵形成完整克制链", () => {
    const infantry = armyOf("infantry", 10);
    const archer = armyOf("archer", 10);
    const cavalry = armyOf("cavalry", 10);

    expect(armyPower(infantry, cavalry)).toBeGreaterThan(armyPower(cavalry, infantry));
    expect(armyPower(cavalry, archer)).toBeGreaterThan(armyPower(archer, cavalry));
    expect(armyPower(archer, infantry)).toBeGreaterThan(armyPower(infantry, archer));
  });

  it("混编军团会按现有构成等比例出征并保留一人", () => {
    const army = { infantry: 20, archer: 10, cavalry: 0 };
    const half = dispatchArmy(army, 0.5);
    expect(half.sent).toEqual({ infantry: 10, archer: 5, cavalry: 0 });
    expect(half.remaining).toEqual({ infantry: 10, archer: 5, cavalry: 0 });

    const all = dispatchArmy(army, 1);
    expect(armyTotal(all.sent)).toBeCloseTo(29);
    expect(armyTotal(all.remaining)).toBeCloseTo(1);
  });

  it("混编堡垒会自动拆成三支可独立改道的野外编队", () => {
    const base = getLegionLevel(1);
    const simulation = new LegionSimulation({
      ...base,
      aiDelay: 999,
      forts: [
        {
          x: 0,
          y: 0,
          faction: "player",
          kind: "barracks",
          specialization: "infantry",
          army: { infantry: 12, archer: 12, cavalry: 12 },
        },
        {
          x: 1000,
          y: 0,
          faction: "ai",
          kind: "barracks",
          specialization: "infantry",
          army: armyOf("infantry", 1),
        },
      ],
    });

    expect(simulation.order(0, { x: 200, y: 200 }, 0.5)).toBe("sent");
    expect(simulation.squads.map((squad) => squad.unit)).toEqual(["infantry", "archer", "cavalry"]);
    expect(simulation.redirect(1, { x: 300, y: 180 })).toBe("sent");
    expect(simulation.squads[1].targetFort).toBeNull();
    expect(simulation.squads[1].stance).toBe("moving");
  });

  it("步兵抵达地面后会结成盾墙驻防", () => {
    const base = getLegionLevel(1);
    const simulation = new LegionSimulation({
      ...base,
      aiDelay: 999,
      forts: [
        {
          x: 0,
          y: 0,
          faction: "player",
          kind: "barracks",
          specialization: "infantry",
          army: armyOf("infantry", 20),
        },
        {
          x: 1000,
          y: 0,
          faction: "ai",
          kind: "barracks",
          specialization: "infantry",
          army: armyOf("infantry", 1),
        },
      ],
    });

    simulation.order(0, { x: 20, y: 0 }, 0.5);
    simulation.update(1);
    simulation.update(0.1);
    expect(simulation.squads).toHaveLength(1);
    expect(simulation.squads[0].targetFort).toBeNull();
    expect(simulation.squads[0].stance).toBe("shield");
  });

  it("弓兵会在接触前齐射，骑兵会以蓄力冲锋造成突击伤害", () => {
    const base = getLegionLevel(1);
    const simulation = new LegionSimulation({
      ...base,
      aiDelay: 999,
      forts: [
        {
          x: 0,
          y: 0,
          faction: "player",
          kind: "outpost",
          specialization: "archer",
          army: armyOf("archer", 30),
        },
        {
          x: 100,
          y: 0,
          faction: "ai",
          kind: "fortress",
          specialization: "cavalry",
          army: armyOf("cavalry", 30),
        },
      ],
    });

    simulation.order(0, { x: 0, y: 200 }, 1);
    simulation.order(1, { x: 100, y: 200 }, 1);
    const archer = simulation.squads.find((squad) => squad.unit === "archer")!;
    const cavalry = simulation.squads.find((squad) => squad.unit === "cavalry")!;
    archer.attackCooldown = 0;
    const beforeVolley = cavalry.soldiers;
    simulation.update(0.05);
    expect(cavalry.soldiers).toBeLessThan(beforeVolley);
    expect(archer.stance).toBe("firing");
    expect(simulation.projectiles.length).toBeGreaterThan(0);

    cavalry.x = archer.x + 5;
    cavalry.y = archer.y;
    cavalry.charge = 1;
    cavalry.chargeCooldown = 0;
    const beforeCharge = archer.soldiers;
    simulation.update(0.01);
    expect(archer.soldiers).toBeLessThan(beforeCharge);
    expect(cavalry.charge).toBe(0);
    expect(cavalry.chargeCooldown).toBeGreaterThan(0);
  });

  it("军营只生产自身专精兵种", () => {
    const produced = produceArmy({ infantry: 0, archer: 10, cavalry: 0 }, "cavalry", 10, 100);
    expect(produced.archer).toBe(10);
    expect(produced.cavalry).toBeCloseTo(7.8);
  });

  it("克制关系和攻城效率会共同决定堡垒归属", () => {
    const infantryAttack = resolveArmyArrival(
      "ai",
      "outpost",
      armyOf("cavalry", 10),
      "player",
      armyOf("infantry", 20),
    );
    expect(infantryAttack.faction).toBe("player");

    const cavalryAttack = resolveArmyArrival(
      "ai",
      "outpost",
      armyOf("infantry", 10),
      "player",
      armyOf("cavalry", 20),
    );
    expect(cavalryAttack.faction).toBe("ai");
  });

  it("AI 会优先进攻被自身兵种克制的目标", () => {
    const forts = [
      {
        x: 0,
        y: 0,
        faction: "ai" as const,
        kind: "barracks" as const,
        specialization: "infantry" as const,
        army: armyOf("infantry", 45),
      },
      {
        x: 100,
        y: -20,
        faction: "player" as const,
        kind: "fortress" as const,
        specialization: "cavalry" as const,
        army: armyOf("cavalry", 15),
      },
      {
        x: 100,
        y: 20,
        faction: "player" as const,
        kind: "outpost" as const,
        specialization: "archer" as const,
        army: armyOf("archer", 15),
      },
    ];
    expect(chooseLegionAiOrder(forts, [])).toMatchObject({ from: 0, to: 1 });
  });

  it("友军增援会在目标堡垒形成混编驻军", () => {
    const base = getLegionLevel(1);
    const level: LegionLevel = {
      ...base,
      aiDelay: 999,
      forts: [
        {
          x: 0,
          y: 0,
          faction: "player",
          kind: "barracks",
          specialization: "infantry",
          army: armyOf("infantry", 30),
        },
        {
          x: 10,
          y: 0,
          faction: "player",
          kind: "outpost",
          specialization: "archer",
          army: armyOf("archer", 10),
        },
        {
          x: 1000,
          y: 0,
          faction: "ai",
          kind: "barracks",
          specialization: "infantry",
          army: armyOf("infantry", 1),
        },
      ],
    };
    const simulation = new LegionSimulation(level);
    expect(simulation.order(0, 1, 0.5)).toBe("sent");
    simulation.update(1);

    expect(simulation.forts[1].army.infantry).toBeCloseTo(15);
    expect(simulation.forts[1].army.archer).toBeGreaterThan(10);
    expect(simulation.renderForts[1].composition?.infantry).toBeCloseTo(15);
  });

  it("提供三关独立军团战役", () => {
    expect([1, 2, 3].map((id) => getLegionLevel(id).id)).toEqual([1, 2, 3]);
  });
});
