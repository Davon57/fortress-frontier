export interface BattleStats {
  elapsed: number;
  orders: number;
  soldiersDispatched: number;
  casualties: number;
  fortsLost: number;
  abilitiesUsed: number;
}

export const createBattleStats = (): BattleStats => ({
  elapsed: 0,
  orders: 0,
  soldiersDispatched: 0,
  casualties: 0,
  fortsLost: 0,
  abilitiesUsed: 0,
});

export type ChallengeRule =
  | { kind: "victory" }
  | { kind: "time"; seconds: number }
  | { kind: "fortsLost"; maximum: number }
  | { kind: "abilitiesUsed"; maximum: number }
  | { kind: "casualties"; maximum: number };

export type ChallengeState = "pending" | "met" | "failed";

export interface ChallengeEvaluation {
  label: string;
  progress: string;
  state: ChallengeState;
}

export interface BattleRating {
  stars: number;
  challenges: ChallengeEvaluation[];
  stats: BattleStats;
}

const challengeLabel = (rule: ChallengeRule) => {
  if (rule.kind === "victory") return "完成本关";
  if (rule.kind === "time") return `${rule.seconds} 秒内获胜`;
  if (rule.kind === "fortsLost") {
    return rule.maximum === 0 ? "不丢失任何堡垒" : `最多丢失 ${rule.maximum} 座堡垒`;
  }
  if (rule.kind === "abilitiesUsed") {
    return rule.maximum === 0 ? "不使用战术技能" : `最多使用 ${rule.maximum} 次技能`;
  }
  return `己方伤亡不超过 ${rule.maximum} 人`;
};

const challengeProgress = (rule: ChallengeRule, stats: BattleStats) => {
  if (rule.kind === "victory") return "战斗进行中";
  if (rule.kind === "time") return `${Math.ceil(stats.elapsed)} / ${rule.seconds} 秒`;
  if (rule.kind === "fortsLost") {
    return stats.fortsLost === 0 ? "尚未失守" : `已失守 ${stats.fortsLost} 次`;
  }
  if (rule.kind === "abilitiesUsed") return `已使用 ${stats.abilitiesUsed} 次`;
  return `当前伤亡 ${Math.floor(stats.casualties)} 人`;
};

const withinLimit = (rule: Exclude<ChallengeRule, { kind: "victory" }>, stats: BattleStats) => {
  if (rule.kind === "time") return stats.elapsed <= rule.seconds;
  if (rule.kind === "fortsLost") return stats.fortsLost <= rule.maximum;
  if (rule.kind === "abilitiesUsed") return stats.abilitiesUsed <= rule.maximum;
  return stats.casualties <= rule.maximum;
};

export const evaluateBattle = (
  rules: readonly ChallengeRule[],
  stats: BattleStats,
  victory: boolean,
  ended: boolean,
): BattleRating => {
  const challenges = rules.map((rule): ChallengeEvaluation => {
    const met = rule.kind === "victory" ? victory : victory && withinLimit(rule, stats);
    const impossible =
      rule.kind === "victory"
        ? ended && !victory
        : !withinLimit(rule, stats) || (ended && !victory);
    return {
      label: challengeLabel(rule),
      progress: met ? "挑战完成" : challengeProgress(rule, stats),
      state: met ? "met" : impossible ? "failed" : "pending",
    };
  });

  return {
    stars: victory ? challenges.filter((challenge) => challenge.state === "met").length : 0,
    challenges,
    stats: { ...stats },
  };
};
