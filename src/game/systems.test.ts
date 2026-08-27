import { describe, expect, it } from "vitest";
import { chooseAiOrder } from "./ai";
import { readUnlocked, unlockAfterVictory } from "./campaign";
import { getLevel } from "./levels";
import { createRoute, routeDistance } from "./navigation";
import { GameSimulation } from "./simulation";
import type { Fort, Squad } from "./types";

describe("游戏子系统", () => {
  it("寻路会选择总路程更短的必经节点", () => {
    const route = createRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [
      { x: 50, y: 80 },
      { x: 50, y: 10 },
    ]);
    expect(route[1]).toEqual({ x: 50, y: 10 });
    expect(routeDistance(route)).toBeGreaterThan(100);
  });

  it("障碍同侧的堡垒会直接前往玩家指定的目标", () => {
    const route = createRoute({ x: 950, y: 150 }, { x: 850, y: 430 }, [
      { x: 590, y: 205 },
      { x: 590, y: 430 },
    ]);
    expect(route).toEqual([
      { x: 950, y: 150 },
      { x: 850, y: 430 },
    ]);
  });

  it("河谷堡垒位于两岸，跨河行军必须经过木桥", () => {
    const river = getLevel(2);
    expect(river.forts.every((fort) => fort.x <= 450 || fort.x >= 700)).toBe(true);
    expect(createRoute(river.forts[0], river.forts[6], river.waypoints)).toEqual([
      river.forts[0],
      river.waypoints[0],
      river.forts[6],
    ]);
    expect(createRoute(river.forts[0], river.forts[2], river.waypoints)).toHaveLength(2);
  });

  it("AI 会综合兵力、距离、产能和玩家威胁选择目标", () => {
    const forts: Fort[] = [
      { x: 0, y: 0, faction: "ai", soldiers: 50, kind: "fortress" },
      { x: 90, y: 0, faction: "neutral", soldiers: 14, kind: "outpost" },
      { x: 120, y: 0, faction: "player", soldiers: 10, kind: "barracks" },
    ];
    expect(chooseAiOrder(forts, [])).toMatchObject({ from: 0, to: 2 });
  });

  it("不同 AI 人格会选择不同的扩张重点", () => {
    const forts: Fort[] = [
      { x: 0, y: 0, faction: "ai", soldiers: 60, kind: "fortress" },
      { x: 60, y: 0, faction: "neutral", soldiers: 8, kind: "outpost" },
      { x: 120, y: 0, faction: "player", soldiers: 10, kind: "barracks" },
    ];

    expect(chooseAiOrder(forts, [], [], "aggressive")).toMatchObject({ to: 2 });
    expect(chooseAiOrder(forts, [], [], "expansionist")).toMatchObject({ to: 1 });
  });

  it("AI 不会强攻打不下来的要塞", () => {
    const forts: Fort[] = [
      { x: 0, y: 0, faction: "ai", soldiers: 20, kind: "barracks" },
      { x: 80, y: 0, faction: "player", soldiers: 90, kind: "fortress" },
    ];
    expect(chooseAiOrder(forts, [])).toBeNull();
  });

  it("AI 不会向已有足够援军在路上的目标重复派兵", () => {
    const forts: Fort[] = [
      { x: 0, y: 0, faction: "ai", soldiers: 60, kind: "fortress" },
      { x: 120, y: 0, faction: "neutral", soldiers: 10, kind: "outpost" },
    ];
    expect(chooseAiOrder(forts, [])).toMatchObject({ from: 0, to: 1 });

    const committed: Squad[] = [
      {
        from: 0,
        to: 1,
        faction: "ai",
        soldiers: 40,
        phase: 0,
        x: 60,
        y: 0,
        route: [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
        ],
        next: 1,
      },
    ];
    expect(chooseAiOrder(forts, [], committed)).toBeNull();
  });

  it("AI 会优先增援即将失守的己方堡垒", () => {
    const forts: Fort[] = [
      { x: 0, y: 0, faction: "ai", soldiers: 60, kind: "fortress" },
      { x: 100, y: 0, faction: "ai", soldiers: 10, kind: "barracks" },
      { x: 200, y: 0, faction: "player", soldiers: 40, kind: "barracks" },
    ];
    const incoming: Squad[] = [
      {
        from: 2,
        to: 1,
        faction: "player",
        soldiers: 30,
        phase: 0,
        x: 150,
        y: 0,
        route: [
          { x: 200, y: 0 },
          { x: 100, y: 0 },
        ],
        next: 1,
      },
    ];
    expect(chooseAiOrder(forts, [], incoming)).toMatchObject({ from: 0, to: 1 });
  });

  it("地形会改变堡垒的产兵效率", () => {
    const base = getLevel(1);
    const simulation = new GameSimulation({
      ...base,
      biome: "desert",
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 20, kind: "barracks" },
        { x: 100, y: 0, faction: "ai", soldiers: 20, kind: "barracks" },
      ],
    });
    simulation.update(1);
    expect(simulation.forts[0].soldiers).toBeCloseTo(21.6);
  });

  it("暂停会冻结战局，二倍速会按两倍时间推进", () => {
    const simulation = new GameSimulation(getLevel(1));
    const initial = simulation.forts[0].soldiers;
    simulation.togglePaused();
    simulation.update(1);
    expect(simulation.forts[0].soldiers).toBe(initial);
    expect(simulation.stats.elapsed).toBe(0);
    expect(simulation.order(0, 1)).toBe("unavailable");

    simulation.togglePaused();
    simulation.setSpeed(2);
    simulation.update(1);
    expect(simulation.forts[0].soldiers).toBeCloseTo(initial + 1.4);
    expect(simulation.stats.elapsed).toBe(2);
  });

  it("玩家按设定比例出兵，兵力不足时会明确拒绝", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 40, kind: "fortress" },
        { x: 300, y: 0, faction: "ai", soldiers: 20, kind: "barracks" },
      ],
    });

    simulation.setDispatchRatio(0.25);
    expect(simulation.order(0, 1)).toBe("sent");
    expect(simulation.squads[0].soldiers).toBe(10);
    expect(simulation.forts[0].soldiers).toBe(30);
    expect(simulation.stats.orders).toBe(1);
    expect(simulation.stats.soldiersDispatched).toBe(10);

    expect(simulation.order(0, 0)).toBe("invalid-target");
    simulation.forts[0] = { ...simulation.forts[0], soldiers: 1 };
    expect(simulation.order(0, 1)).toBe("insufficient");
  });

  it("倾巢而出后老家失守，仍会等在途部队打完才判负", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 40, kind: "fortress" },
        { x: 900, y: 0, faction: "ai", soldiers: 20, kind: "barracks" },
      ],
    });

    simulation.setDispatchRatio(1);
    expect(simulation.order(0, 1)).toBe("sent");
    simulation.forts[0] = { ...simulation.forts[0], faction: "ai" };
    expect(simulation.update(0.1)).toBeNull();

    simulation.squads.length = 0;
    expect(simulation.update(0.1)).toBe("ai");
  });

  it("会统计己方伤亡和堡垒失守次数", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      aiAbility: null,
      aiDelay: 999,
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 10, kind: "outpost" },
        { x: 100, y: 0, faction: "player", soldiers: 20, kind: "fortress" },
        { x: 900, y: 0, faction: "ai", soldiers: 30, kind: "fortress" },
      ],
    });
    simulation.squads.push({
      from: 2,
      to: 0,
      faction: "ai",
      soldiers: 20,
      phase: 0,
      x: 0,
      y: 0,
      route: [
        { x: 900, y: 0 },
        { x: 0, y: 0 },
      ],
      next: 1,
    });

    simulation.update(0.01);
    expect(simulation.forts[0].faction).toBe("ai");
    expect(simulation.stats.casualties).toBeCloseTo(10.01);
    expect(simulation.stats.fortsLost).toBe(1);
  });

  it("占点目标会在敌军逼近时暂停坚守计时", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      aiDelay: 999,
      aiAbility: null,
      objective: { kind: "hold", target: 0, duration: 10 },
      forts: [
        { x: 100, y: 0, faction: "player", soldiers: 30, kind: "outpost" },
        { x: 900, y: 0, faction: "ai", soldiers: 1, kind: "fortress" },
      ],
    });

    expect(simulation.update(5)).toBeNull();
    expect(simulation.objective.progress).toBeCloseTo(5);

    simulation.squads.push({
      from: 1,
      to: 0,
      faction: "ai",
      soldiers: 2,
      phase: 0,
      x: 200,
      y: 0,
      route: [
        { x: 900, y: 0 },
        { x: 100, y: 0 },
      ],
      next: 1,
    });
    expect(simulation.update(0.5)).toBeNull();
    expect(simulation.objective.progress).toBeCloseTo(5);
    expect(simulation.objectiveView.state).toBe("contested");

    simulation.squads.length = 0;
    expect(simulation.update(5)).toBe("player");
    expect(simulation.endReason).toContain("稳固控制");
  });

  it("核心堡垒失守会立即判定守城目标失败", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      aiAbility: null,
      objective: { kind: "defend", target: 0, duration: 30 },
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 30, kind: "fortress" },
        { x: 100, y: 0, faction: "player", soldiers: 20, kind: "outpost" },
        { x: 900, y: 0, faction: "ai", soldiers: 30, kind: "fortress" },
      ],
    });

    simulation.forts[0] = { ...simulation.forts[0], faction: "ai" };
    expect(simulation.update(0.1)).toBe("ai");
    expect(simulation.endReason).toBe("核心堡垒已经失守。");
  });

  it("连续突破会逐个推进当前战略目标", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      aiAbility: null,
      objective: { kind: "captureSequence", targets: [1, 2] },
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 30, kind: "fortress" },
        { x: 200, y: 0, faction: "neutral", soldiers: 10, kind: "outpost" },
        { x: 400, y: 0, faction: "ai", soldiers: 20, kind: "barracks" },
        { x: 900, y: 0, faction: "ai", soldiers: 30, kind: "fortress" },
      ],
    });

    simulation.forts[1] = { ...simulation.forts[1], faction: "player" };
    expect(simulation.update(0.1)).toBeNull();
    expect(simulation.objective.sequenceIndex).toBe(1);
    expect(simulation.objectiveView.targetForts).toEqual([2]);

    simulation.forts[2] = { ...simulation.forts[2], faction: "player" };
    expect(simulation.update(0.1)).toBe("player");
    expect(simulation.endReason).toContain("推进目标");
  });

  it("敌方指挥官会自动施放人格对应的单一战术", () => {
    const simulation = new GameSimulation({
      ...getLevel(2),
      aiDelay: 999,
      objective: { kind: "eliminate" },
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 100, kind: "fortress" },
        { x: 900, y: 0, faction: "ai", soldiers: 10, kind: "barracks" },
      ],
    });

    expect(simulation.aiAbility?.id).toBe("conscription");
    simulation.update(12);
    expect(simulation.aiAbility?.state.charges).toBe(1);
    const before = simulation.forts[1].soldiers;
    simulation.update(1);
    expect(simulation.forts[1].soldiers - before).toBeCloseTo(4);
  });

  it("战术技能受冷却与充能限制，增益只作用于玩家一方", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 40, kind: "barracks" },
        { x: 900, y: 0, faction: "ai", soldiers: 40, kind: "barracks" },
      ],
    });

    expect(simulation.castAbility("conscription")).toBe("cast");
    expect(simulation.castAbility("conscription")).toBe("cooling");
    expect(simulation.stats.abilitiesUsed).toBe(1);

    simulation.update(1);
    expect(simulation.forts[0].soldiers).toBeCloseTo(44);
    expect(simulation.forts[1].soldiers).toBeCloseTo(42);
    expect(simulation.abilities.conscription.charges).toBe(2);
  });

  it("急行军只加速己方部队，炮火支援会削弱敌军，坚壁只能落在己方堡垒", () => {
    const simulation = new GameSimulation({
      ...getLevel(1),
      forts: [
        { x: 0, y: 0, faction: "player", soldiers: 40, kind: "barracks" },
        { x: 900, y: 0, faction: "ai", soldiers: 40, kind: "barracks" },
      ],
    });

    expect(simulation.order(0, 1, 0.5)).toBe("sent");
    expect(simulation.castAbility("forcedMarch")).toBe("cast");
    simulation.update(1);
    expect(simulation.squads[0].x).toBeCloseTo(54 * 1.6);

    expect(simulation.order(1, 0, 0.5)).toBe("sent");
    const hostile = simulation.squads.findIndex((squad) => squad.faction === "ai");
    expect(simulation.castAbility("barrage", hostile)).toBe("cast");
    expect(simulation.squads[hostile].soldiers).toBeCloseTo(14.7);

    expect(simulation.castAbility("bulwark", 1)).toBe("invalid-target");
    expect(simulation.castAbility("bulwark", 0)).toBe("cast");
    expect(simulation.hasEffect("bulwark", 0)).toBe(true);
    expect(simulation.hasEffect("bulwark", 1)).toBe(false);
  });

  it("战役存档会修正异常值并安全解锁下一关", () => {
    const values = new Map<string, string>([["fortress-unlocked", "invalid"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(readUnlocked(storage, 10)).toBe(1);
    expect(unlockAfterVictory(storage, 3, 10)).toBe(4);
    expect(readUnlocked(storage, 10)).toBe(4);
  });
});
