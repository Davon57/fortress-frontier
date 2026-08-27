import { describe, expect, it } from "vitest";
import { readCampaignRecords, recordVictory } from "./campaign";
import { createBattleStats, evaluateBattle, type ChallengeRule } from "./scoring";

const challenges: ChallengeRule[] = [
  { kind: "victory" },
  { kind: "time", seconds: 100 },
  { kind: "fortsLost", maximum: 0 },
];

describe("战后评分", () => {
  it("会按胜利、限时和特殊条件分别授予星级", () => {
    const stats = createBattleStats();
    stats.elapsed = 80;
    expect(evaluateBattle(challenges, stats, true, true).stars).toBe(3);

    stats.elapsed = 120;
    stats.fortsLost = 1;
    const rating = evaluateBattle(challenges, stats, true, true);
    expect(rating.stars).toBe(1);
    expect(rating.challenges.map((challenge) => challenge.state)).toEqual([
      "met",
      "failed",
      "failed",
    ]);
  });

  it("战斗中会把已经无法完成的挑战标记为失败", () => {
    const stats = createBattleStats();
    stats.elapsed = 101;
    const rating = evaluateBattle(challenges, stats, false, false);
    expect(rating.stars).toBe(0);
    expect(rating.challenges[0].state).toBe("pending");
    expect(rating.challenges[1].state).toBe("failed");
    expect(rating.challenges[2].state).toBe("pending");
  });

  it("会保留最高星、最快时间和最少伤亡", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    const firstStats = createBattleStats();
    firstStats.elapsed = 80;
    firstStats.casualties = 40;
    firstStats.fortsLost = 1;
    recordVictory(storage, 2, evaluateBattle(challenges, firstStats, true, true), 10);

    const secondStats = createBattleStats();
    secondStats.elapsed = 90;
    secondStats.casualties = 20;
    recordVictory(storage, 2, evaluateBattle(challenges, secondStats, true, true), 10);

    expect(readCampaignRecords(storage, 10)[2]).toEqual({
      stars: 3,
      bestTime: 80,
      bestCasualties: 20,
      victories: 2,
    });
  });

  it("会忽略损坏的成绩存档并限制异常星数", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          1: { stars: 99, bestTime: "bad", bestCasualties: -4, victories: 2.8 },
          20: { stars: 3, bestTime: 10, bestCasualties: 0, victories: 1 },
        }),
      setItem: () => undefined,
    };

    expect(readCampaignRecords(storage, 10)).toEqual({
      1: { stars: 3, bestTime: null, bestCasualties: null, victories: 2 },
    });
  });
});
