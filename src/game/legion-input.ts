import type { Application, FederatedPointerEvent } from "pixi.js";
import type { InputSelection } from "./input";
import type { LegionOrderOutcome, LegionSimulation } from "./legion-simulation";
import type { Point } from "./types";

export interface LegionInputHandlers {
  setStatus: (message: string) => void;
  onDispatchRatioChange: (ratio: number) => void;
}

export interface FieldSelection {
  squad: number;
  pointer: Point;
  target: number;
}

const RATIO_WHEEL_STEP = 0.05;

const orderMessages: Record<LegionOrderOutcome, string> = {
  sent: "战术命令已下达，野外编队可再次拖拽改道。",
  insufficient: "驻军不足：每座堡垒至少保留 1 人。",
  "invalid-target": "命令取消：没有可执行该命令的军团。",
  unavailable: "战局已暂停或结束，暂时无法下达命令。",
};

export class LegionInputController {
  readonly selection: InputSelection = {
    source: -1,
    target: -1,
    pointer: { x: 0, y: 0 },
  };
  readonly fieldSelection: FieldSelection = {
    squad: -1,
    target: -1,
    pointer: { x: 0, y: 0 },
  };

  constructor(
    app: Application,
    private readonly simulation: LegionSimulation,
    private readonly handlers: LegionInputHandlers,
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

  private pointerDown = (event: FederatedPointerEvent) => {
    if (this.simulation.ended || this.simulation.paused) return;
    const point = { x: event.global.x, y: event.global.y };
    const fort = this.simulation.fortAt(point.x, point.y);
    if (fort >= 0 && this.simulation.forts[fort].faction === "player") {
      this.selection.source = fort;
      this.selection.target = -1;
      this.selection.pointer = point;
      return;
    }
    const squad = this.simulation.squadAt(point.x, point.y);
    if (squad >= 0) {
      this.fieldSelection.squad = squad;
      this.fieldSelection.target = -1;
      this.fieldSelection.pointer = point;
      this.handlers.setStatus("已选中野外编队：拖向地面或堡垒即可改道。");
    }
  };

  private pointerMove = (event: FederatedPointerEvent) => {
    const point = { x: event.global.x, y: event.global.y };
    if (this.selection.source >= 0) {
      this.selection.pointer = point;
      const hovered = this.simulation.fortAt(point.x, point.y);
      this.selection.target = hovered === this.selection.source ? -1 : hovered;
    } else if (this.fieldSelection.squad >= 0) {
      this.fieldSelection.pointer = point;
      this.fieldSelection.target = this.simulation.fortAt(point.x, point.y);
    }
  };

  private pointerUp = (event: FederatedPointerEvent) => {
    const point = { x: event.global.x, y: event.global.y };
    const fort = this.simulation.fortAt(point.x, point.y);

    if (this.selection.source >= 0) {
      const source = this.selection.source;
      this.selection.source = -1;
      this.selection.target = -1;
      const target: number | Point = fort >= 0 && fort !== source ? fort : point;
      this.handlers.setStatus(orderMessages[this.simulation.order(source, target)]);
      return;
    }

    if (this.fieldSelection.squad >= 0) {
      const squad = this.fieldSelection.squad;
      this.fieldSelection.squad = -1;
      this.fieldSelection.target = -1;
      const target: number | Point = fort >= 0 ? fort : point;
      this.handlers.setStatus(orderMessages[this.simulation.redirect(squad, target)]);
    }
  };

  private cancel = () => {
    if (this.selection.source >= 0 || this.fieldSelection.squad >= 0) {
      this.selection.source = -1;
      this.selection.target = -1;
      this.fieldSelection.squad = -1;
      this.fieldSelection.target = -1;
      this.handlers.setStatus("战术命令已取消。");
    }
  };

  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    const step = event.deltaY < 0 ? RATIO_WHEEL_STEP : -RATIO_WHEEL_STEP;
    const aligned = Math.round((this.simulation.dispatchRatio + step) / RATIO_WHEEL_STEP);
    this.handlers.onDispatchRatioChange(aligned * RATIO_WHEEL_STEP);
  };
}
