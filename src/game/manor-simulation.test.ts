import { describe, expect, it } from "vitest";
import { ManorSimulation } from "./manor-simulation";

describe("领主经营", () => {
  it("建造会消耗木材并增加对应建筑", () => {
    const game = new ManorSimulation();
    expect(game.build("lumberyard")).toBe(true);
    expect(game.state.buildings.lumberyard).toBe(1);
  });
  it("民兵需要影响力、工具和闲置劳力", () => {
    const game = new ManorSimulation();
    game.state.tools = 1;
    expect(game.recruit()).toBe(true);
    expect(game.state.militia).toBe(1);
  });
  it("冬季缺粮会造成人口流失", () => {
    const game = new ManorSimulation();
    game.state.food = 0;
    game.state.buildings.forager = 0;
    game.update(90);
    expect(game.state.population).toBeLessThan(6);
  });
});
