import { describe, expect, it } from "vitest";
import {
  clampDispatchRatio,
  dispatchCount,
  produce,
  resolveArrival,
  resolveClash,
  resolveNearbyClashes,
  winner,
} from "./logic";
import { getLevel } from "./levels";

describe("堡垒占领规则", () => {
  it("出兵比例由玩家独立设定，且始终为堡垒留下守军", () => {
    expect(clampDispatchRatio(0)).toBe(0.05);
    expect(clampDispatchRatio(3)).toBe(1);
    expect(clampDispatchRatio(Number.NaN)).toBe(0.05);
    expect(dispatchCount(50, 0.5)).toBe(25);
    expect(dispatchCount(50, 1)).toBe(49);
    expect(dispatchCount(1, 1)).toBe(0);
  });

  it("不同堡垒的产兵速度与上限各不相同，超编驻军不会被削减", () => {
    expect(produce({ faction: "player", soldiers: 20, kind: "barracks" }, 2).soldiers).toBe(24);
    expect(produce({ faction: "player", soldiers: 20, kind: "fortress" }, 2).soldiers).toBeCloseTo(
      21.4,
    );
    expect(produce({ faction: "player", soldiers: 59, kind: "barracks" }, 2).soldiers).toBe(60);
    expect(produce({ faction: "player", soldiers: 88, kind: "barracks" }, 2).soldiers).toBe(88);
    expect(produce({ faction: "neutral", soldiers: 30, kind: "barracks" }, 10).soldiers).toBe(30);
  });

  it("野战损耗按兵力比例分配，人多的一方明显占优", () => {
    const even = resolveClash(20, 20, 1);
    expect(even.first).toBeCloseTo(8);
    expect(even.second).toBeCloseTo(8);

    const lopsided = resolveClash(50, 10, 1);
    expect(lopsided.first).toBeCloseTo(46);
    expect(lopsided.second).toBe(0);
  });

  it("多支部队围攻同一目标时损耗会叠加", () => {
    const units = resolveNearbyClashes(
      [
        { faction: "player" as const, soldiers: 20, x: 10, y: 10 },
        { faction: "ai" as const, soldiers: 20, x: 15, y: 10 },
        { faction: "ai" as const, soldiers: 20, x: 18, y: 10 },
      ],
      1,
    );
    expect(units.map((unit) => unit.soldiers)).toEqual([0, 8, 8]);
  });

  it("同阵营部队并肩行军不会互相消耗", () => {
    const units = resolveNearbyClashes(
      [
        { faction: "player" as const, soldiers: 20, x: 10, y: 10 },
        { faction: "player" as const, soldiers: 20, x: 15, y: 10 },
      ],
      1,
    );
    expect(units.map((unit) => unit.soldiers)).toEqual([20, 20]);
  });

  it("守军享有堡垒防御加成，攻破后才会易主", () => {
    expect(resolveArrival({ faction: "ai", soldiers: 10, kind: "barracks" }, "player", 14)).toEqual(
      {
        faction: "player",
        soldiers: 4,
        kind: "barracks",
      },
    );

    // 要塞守军 10 人相当于 16 战力，14 人打不动，剩余战力折算回人数。
    const held = resolveArrival({ faction: "ai", soldiers: 10, kind: "fortress" }, "player", 14);
    expect(held.faction).toBe("ai");
    expect(held.soldiers).toBeCloseTo(1.25);

    expect(
      resolveArrival({ faction: "ai", soldiers: 10, kind: "fortress" }, "player", 20).faction,
    ).toBe("player");

    // 坚壁把防御再翻一倍，同样的兵力就攻不下来了。
    expect(
      resolveArrival({ faction: "ai", soldiers: 10, kind: "fortress" }, "player", 20, 2).faction,
    ).toBe("ai");

    expect(
      resolveArrival({ faction: "player", soldiers: 10, kind: "outpost" }, "player", 5).soldiers,
    ).toBe(15);
  });

  it("能判定全图胜利", () => {
    expect(
      winner([
        { faction: "player", soldiers: 1, kind: "barracks" },
        { faction: "player", soldiers: 1, kind: "outpost" },
      ]),
    ).toBe("player");
    expect(
      winner([
        { faction: "player", soldiers: 1, kind: "barracks" },
        { faction: "neutral", soldiers: 20, kind: "fortress" },
      ]),
    ).toBe("player");
    expect(winner([{ faction: "neutral", soldiers: 20, kind: "fortress" }])).toBeNull();
  });

  it("失去全部堡垒的一方只要还有在途部队就未被消灭", () => {
    const conquered = [
      { faction: "player" as const, soldiers: 12, kind: "barracks" as const },
      { faction: "player" as const, soldiers: 8, kind: "outpost" as const },
    ];
    expect(winner(conquered)).toBe("player");
    expect(winner(conquered, [{ faction: "ai", soldiers: 20 }])).toBeNull();
    expect(winner(conquered, [{ faction: "ai", soldiers: 0 }])).toBe("player");
    expect(winner(conquered, [{ faction: "player", soldiers: 20 }])).toBe("player");
  });

  it("非法关卡参数会安全回退到第一关", () => {
    expect(getLevel(Number.NaN).id).toBe(1);
    expect(getLevel(Number.POSITIVE_INFINITY).id).toBe(1);
    expect(getLevel(999).id).toBe(10);
  });
});
