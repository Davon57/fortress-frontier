import { describe, expect, it } from "vitest";
import { dispatchCount, dispatchRatio, produce, resolveArrival, resolveClash, winner } from "./logic";

describe("堡垒占领规则", () => {
  it("拖拽距离映射到百分之十至百分之百出兵", () => {
    expect(dispatchRatio(0)).toBe(.1);
    expect(dispatchRatio(999)).toBe(1);
    expect(dispatchCount(50, .5)).toBe(25);
    expect(dispatchCount(1, 1)).toBe(0);
  });

  it("阵营堡垒缓慢产兵，中立堡垒保持固定守军", () => {
    expect(produce({ faction: "player", soldiers: 20, production: 4 }, 2).soldiers).toBe(28);
    expect(produce({ faction: "player", soldiers: 89, production: 4 }, 2).soldiers).toBe(90);
    expect(produce({ faction: "neutral", soldiers: 30, production: 4 }, 10).soldiers).toBe(30);
  });

  it("道路相遇的双方会同时损失兵力", () => {
    expect(resolveClash(20, 17, 1)).toEqual({ first: 8, second: 5 });
  });

  it("攻破驻军会改变堡垒阵营，并能判定全图胜利", () => {
    expect(resolveArrival({ faction: "ai", soldiers: 10, production: 4 }, "player", 14)).toMatchObject({ faction: "player", soldiers: 4 });
    expect(resolveArrival({ faction: "neutral", soldiers: 10, production: 0 }, "player", 14)).toMatchObject({ faction: "player", soldiers: 4, production: 1 });
    expect(winner([{ faction: "player", soldiers: 1, production: 1 }, { faction: "player", soldiers: 1, production: 1 }])).toBe("player");
  });
});
