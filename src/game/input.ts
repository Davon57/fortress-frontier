import type { Application, FederatedPointerEvent } from "pixi.js";
import {
  abilityProfiles,
  abilityReadiness,
  type AbilityId,
  type AbilityOutcome,
} from "./abilities";
import type { GameSimulation, OrderOutcome } from "./simulation";
import type { Point } from "./types";

export interface InputSelection {
  source: number;
  /** 指针当前悬停的堡垒，供渲染层预览真实行军路线；无有效目标时为 -1。 */
  target: number;
  pointer: Point;
}

export interface InputHandlers {
  setStatus: (message: string) => void;
  onDispatchRatioChange: (ratio: number) => void;
  onAbilityStateChange: () => void;
}

const RATIO_WHEEL_STEP = 0.05;

const orderMessages: Record<OrderOutcome, string> = {
  sent: "部队已出征，敌军也在同时调兵。",
  insufficient: "驻军不足：每座堡垒至少留 1 人，请提高出兵比例或等待补充。",
  "invalid-target": "命令取消：请拖到一座目标堡垒。",
  unavailable: "战局已暂停或结束，暂时无法出兵。",
};

const abilityMessages: Record<AbilityOutcome, (name: string) => string> = {
  cast: (name) => `${name} 已发动。`,
  cooling: (name) => `${name} 仍在冷却中。`,
  depleted: (name) => `${name} 本局次数已用尽。`,
  "invalid-target": (name) => `${name} 目标无效。`,
  unavailable: () => "战局已暂停或结束，无法施放战术。",
};

export class InputController {
  readonly selection: InputSelection = { source: -1, target: -1, pointer: { x: 0, y: 0 } };
  armed: AbilityId | null = null;

  constructor(
    private readonly app: Application,
    private readonly simulation: GameSimulation,
    private readonly handlers: InputHandlers,
  ) {
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", this.pointerDown);
    app.stage.on("pointermove", this.pointerMove);
    app.stage.on("pointerup", this.pointerUp);
    app.stage.on("pointerupoutside", this.cancel);
    app.stage.on("pointercancel", this.cancel);
    app.canvas.addEventListener("wheel", this.wheel, { passive: false });
  }

  /** 无目标战术立即发动；需要目标的进入瞄准态，再点一次同一个按钮则取消。 */
  triggerAbility(ability: AbilityId) {
    const profile = abilityProfiles[ability];

    if (this.armed === ability) {
      this.setArmed(null);
      this.handlers.setStatus(`${profile.name} 已取消。`);
      return;
    }
    if (profile.targeting === "none") {
      this.setArmed(null);
      const outcome = this.simulation.castAbility(ability);
      this.handlers.setStatus(abilityMessages[outcome](profile.name));
      this.handlers.onAbilityStateChange();
      return;
    }

    const readiness = abilityReadiness(this.simulation.abilities[ability]);
    if (readiness !== "cast" || this.simulation.ended || this.simulation.paused) {
      const outcome = this.simulation.ended || this.simulation.paused ? "unavailable" : readiness;
      this.handlers.setStatus(abilityMessages[outcome](profile.name));
      return;
    }
    this.setArmed(ability);
    this.handlers.setStatus(`${profile.name} 已就绪：${profile.hint}`);
  }

  cancelAiming() {
    if (!this.armed) return;
    const name = abilityProfiles[this.armed].name;
    this.setArmed(null);
    this.handlers.setStatus(`${name} 已取消。`);
  }

  private setArmed(ability: AbilityId | null) {
    this.armed = ability;
    this.app.canvas.style.cursor = ability ? "crosshair" : "";
    this.handlers.onAbilityStateChange();
  }

  private castArmed(x: number, y: number) {
    const ability = this.armed;
    if (!ability) return;
    const profile = abilityProfiles[ability];
    const target =
      profile.targeting === "squad" ? this.simulation.squadAt(x, y) : this.simulation.fortAt(x, y);
    const outcome = this.simulation.castAbility(ability, target);

    if (outcome === "invalid-target") {
      this.handlers.setStatus(
        profile.targeting === "squad"
          ? `${profile.name}：请点选一支敌方行军部队。`
          : `${profile.name}：请点选一座己方堡垒。`,
      );
      return;
    }
    this.setArmed(null);
    this.handlers.setStatus(abilityMessages[outcome](profile.name));
  }

  private pointerDown = (event: FederatedPointerEvent) => {
    if (this.armed) {
      this.castArmed(event.global.x, event.global.y);
      return;
    }
    if (this.simulation.ended || this.simulation.paused) return;
    const id = this.simulation.fortAt(event.global.x, event.global.y);
    if (id >= 0 && this.simulation.forts[id].faction === "player") {
      this.selection.source = id;
      this.selection.target = -1;
      this.selection.pointer = { x: event.global.x, y: event.global.y };
    }
  };

  private pointerMove = (event: FederatedPointerEvent) => {
    if (this.selection.source < 0) return;
    this.selection.pointer = { x: event.global.x, y: event.global.y };
    const hovered = this.simulation.fortAt(event.global.x, event.global.y);
    this.selection.target = hovered === this.selection.source ? -1 : hovered;
  };

  private pointerUp = (event: FederatedPointerEvent) => {
    const source = this.selection.source;
    if (source < 0) return;
    this.selection.source = -1;
    this.selection.target = -1;

    const target = this.simulation.fortAt(event.global.x, event.global.y);
    if (target < 0 || target === source) {
      this.handlers.setStatus(orderMessages["invalid-target"]);
      return;
    }
    this.handlers.setStatus(orderMessages[this.simulation.order(source, target)]);
  };

  private cancel = () => {
    if (this.selection.source >= 0) {
      this.selection.source = -1;
      this.selection.target = -1;
      this.handlers.setStatus("命令取消：拖拽已离开战场。");
    }
  };

  /** 对齐到 5% 网格，避免滚轮反复累加后出现 0.35000000000000003 这类比例。 */
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    const step = event.deltaY < 0 ? RATIO_WHEEL_STEP : -RATIO_WHEEL_STEP;
    const aligned = Math.round((this.simulation.dispatchRatio + step) / RATIO_WHEEL_STEP);
    this.handlers.onDispatchRatioChange(aligned * RATIO_WHEEL_STEP);
  };
}
