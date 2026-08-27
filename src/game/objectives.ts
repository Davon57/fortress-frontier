import type { Faction } from "./logic";
import type { Fort, Squad } from "./types";

export type BattleOutcome = Exclude<Faction, "neutral">;

export type LevelObjective =
  | { kind: "eliminate" }
  | { kind: "hold"; target: number; duration: number }
  | { kind: "defend"; target: number; duration: number }
  | { kind: "captureSequence"; targets: number[] };

export type ObjectiveState = "active" | "contested" | "complete" | "failed";

export interface ObjectiveRuntime {
  elapsed: number;
  progress: number;
  sequenceIndex: number;
  contested: boolean;
  outcome: BattleOutcome | null;
  message: string;
  initialAiForts: number;
}

export interface ObjectiveView {
  title: string;
  detail: string;
  progress: number;
  state: ObjectiveState;
  targetForts: number[];
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const hostileNear = (target: Fort, squads: readonly Squad[], radius = 115) =>
  squads.some(
    (squad) =>
      squad.faction === "ai" &&
      squad.soldiers > 0 &&
      Math.hypot(squad.x - target.x, squad.y - target.y) <= radius,
  );

export const createObjectiveRuntime = (forts: readonly Fort[]): ObjectiveRuntime => ({
  elapsed: 0,
  progress: 0,
  sequenceIndex: 0,
  contested: false,
  outcome: null,
  message: "",
  initialAiForts: Math.max(1, forts.filter((fort) => fort.faction === "ai").length),
});

export const finishObjective = (
  runtime: ObjectiveRuntime,
  outcome: BattleOutcome,
  message: string,
) => {
  runtime.outcome = outcome;
  runtime.message = message;
  runtime.contested = false;
};

export const advanceObjective = (
  objective: LevelObjective,
  runtime: ObjectiveRuntime,
  forts: readonly Fort[],
  squads: readonly Squad[],
  elapsed: number,
): BattleOutcome | null => {
  if (runtime.outcome) return runtime.outcome;
  runtime.elapsed += elapsed;
  runtime.contested = false;

  if (objective.kind === "hold") {
    const target = forts[objective.target];
    if (!target) return null;
    runtime.contested = target.faction === "player" && hostileNear(target, squads);
    if (target.faction !== "player") runtime.progress = 0;
    else if (!runtime.contested) runtime.progress += elapsed;

    if (runtime.progress >= objective.duration) {
      runtime.progress = objective.duration;
      finishObjective(runtime, "player", "目标要地已被我方稳固控制。");
    }
  } else if (objective.kind === "defend") {
    const target = forts[objective.target];
    if (!target || target.faction !== "player") {
      finishObjective(runtime, "ai", "核心堡垒已经失守。");
    } else {
      runtime.contested = hostileNear(target, squads);
      runtime.progress = Math.min(objective.duration, runtime.progress + elapsed);
      if (runtime.progress >= objective.duration) {
        finishObjective(runtime, "player", "核心堡垒坚守至援军抵达。");
      }
    }
  } else if (objective.kind === "captureSequence") {
    while (
      runtime.sequenceIndex < objective.targets.length &&
      forts[objective.targets[runtime.sequenceIndex]]?.faction === "player"
    ) {
      runtime.sequenceIndex += 1;
    }
    if (runtime.sequenceIndex >= objective.targets.length) {
      finishObjective(runtime, "player", "所有推进目标均已占领。");
    }
  }

  return runtime.outcome;
};

export const getObjectiveView = (
  objective: LevelObjective,
  runtime: ObjectiveRuntime,
  forts: readonly Fort[],
): ObjectiveView => {
  const terminalState =
    runtime.outcome === "player" ? "complete" : runtime.outcome === "ai" ? "failed" : null;

  if (objective.kind === "hold") {
    const target = forts[objective.target];
    const seconds = Math.floor(runtime.progress);
    const detail = runtime.outcome
      ? runtime.message
      : target?.faction !== "player"
        ? "夺取地图上的金色目标堡垒后开始计时"
        : runtime.contested
          ? `敌军进入目标区域，坚守计时暂停在 ${seconds} 秒`
          : `已连续控制 ${seconds} / ${objective.duration} 秒`;
    return {
      title: `胜利目标：占领并坚守目标堡垒 ${objective.duration} 秒`,
      detail,
      progress: clamp01(runtime.progress / objective.duration),
      state: terminalState ?? (runtime.contested ? "contested" : "active"),
      targetForts: [objective.target],
    };
  }

  if (objective.kind === "defend") {
    const remaining = Math.max(0, Math.ceil(objective.duration - runtime.progress));
    return {
      title: `胜利目标：守住核心堡垒 ${objective.duration} 秒`,
      detail: runtime.outcome
        ? runtime.message
        : runtime.contested
          ? `核心堡垒正在遭受进攻，还需坚守 ${remaining} 秒`
          : `援军将在 ${remaining} 秒后抵达`,
      progress: clamp01(runtime.progress / objective.duration),
      state: terminalState ?? (runtime.contested ? "contested" : "active"),
      targetForts: [objective.target],
    };
  }

  if (objective.kind === "captureSequence") {
    const total = objective.targets.length;
    const current = Math.min(runtime.sequenceIndex + 1, total);
    return {
      title: `胜利目标：依次占领 ${total} 座战略堡垒`,
      detail: runtime.outcome
        ? runtime.message
        : `当前推进目标 ${current} / ${total}，请攻占地图上的金色标记`,
      progress: total > 0 ? clamp01(runtime.sequenceIndex / total) : 1,
      state: terminalState ?? "active",
      targetForts: runtime.sequenceIndex < total ? [objective.targets[runtime.sequenceIndex]] : [],
    };
  }

  const aiForts = forts.filter((fort) => fort.faction === "ai").length;
  const captured = Math.max(0, runtime.initialAiForts - aiForts);
  return {
    title: "胜利目标：消灭全部敌方堡垒与在途部队",
    detail: runtime.outcome
      ? runtime.message
      : `已夺取 ${captured} / ${runtime.initialAiForts} 座初始敌方堡垒`,
    progress: clamp01(captured / runtime.initialAiForts),
    state: terminalState ?? "active",
    targetForts: [],
  };
};
