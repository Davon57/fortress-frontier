import { Container, Graphics, Text, TextStyle, type Application } from "pixi.js";
import { dispatchCount, fortProfiles, type Faction, type FortKind } from "./logic";
import { createRoute, routeDistance } from "./navigation";
import type { ObjectiveView } from "./objectives";
import type { Biome } from "./terrain";
import type { InputSelection } from "./input";
import type { ArmyComposition, Fort, Point, Squad, UnitType } from "./types";

export const GAME_WIDTH = 1100;
export const GAME_HEIGHT = 620;

export interface RenderLevel {
  id: number;
  name: string;
  biome: Biome;
  briefing: string;
  waypoints: Point[];
}

const colors: Record<Faction, number> = {
  player: 0x3978d8,
  ai: 0xbf3d42,
  neutral: 0x8d8068,
};

/** 塔楼数量与城墙让三种堡垒在战场上可以一眼区分。 */
const fortStyles: Record<
  FortKind,
  { radius: number; towers: number; mast: number; wall: boolean }
> = {
  fortress: { radius: 42, towers: 3, mast: 50, wall: true },
  barracks: { radius: 36, towers: 2, mast: 42, wall: false },
  outpost: { radius: 30, towers: 1, mast: 35, wall: false },
};

const ROUTE_COLORS = { attack: 0xf08a3c, reinforce: 0x3978d8, waypoint: 0xffe08a };
const UNIT_COLORS: Record<UnitType, number> = {
  infantry: 0x8fa8bd,
  archer: 0x78a66c,
  cavalry: 0xd3a452,
};
const UNIT_SHORT: Record<UnitType, string> = {
  infantry: "步",
  archer: "弓",
  cavalry: "骑",
};
const UNIT_ORDER: UnitType[] = ["infantry", "archer", "cavalry"];

const compositionText = (army: ArmyComposition) =>
  UNIT_ORDER.map((unit) => `${UNIT_SHORT[unit]}${Math.floor(army[unit])}`).join(" ");

const fortCompositionText = (fort: Fort) =>
  fort.composition
    ? `${fort.specialization ? `产${UNIT_SHORT[fort.specialization]} · ` : ""}${compositionText(fort.composition)}`
    : "";

interface BiomePalette {
  ground: number;
  ridge: number;
  ridgeLight: number;
  foliage: number;
  foliageDark: number;
  foliageLight: number;
  road: number;
  field: number;
  fieldEdge: number;
  fieldLine: number;
  rock: number;
  rockLight: number;
  /** 植被取样步长：1 为全部，2/3 让荒芜地貌显著稀疏。 */
  foliageStep: number;
}

const palettes: Record<Biome, BiomePalette> = {
  grassland: {
    ground: 0x9fb66e,
    ridge: 0x708657,
    ridgeLight: 0x829c60,
    foliage: 0x607b46,
    foliageDark: 0x58723f,
    foliageLight: 0x91a965,
    road: 0xbea373,
    field: 0xb2a65f,
    fieldEdge: 0x897a45,
    fieldLine: 0xd5c87a,
    rock: 0x7d8066,
    rockLight: 0xb5b28b,
    foliageStep: 1,
  },
  river: {
    ground: 0x9fb66e,
    ridge: 0x708657,
    ridgeLight: 0x829c60,
    foliage: 0x607b46,
    foliageDark: 0x58723f,
    foliageLight: 0x91a965,
    road: 0xbea373,
    field: 0xb2a65f,
    fieldEdge: 0x897a45,
    fieldLine: 0xd5c87a,
    rock: 0x7d8066,
    rockLight: 0xb5b28b,
    foliageStep: 1,
  },
  desert: {
    ground: 0xd9b86d,
    ridge: 0xbf9d54,
    ridgeLight: 0xd0ad63,
    foliage: 0x8a9a55,
    foliageDark: 0x76854a,
    foliageLight: 0xa8b26e,
    road: 0xc9a259,
    field: 0xc7ad66,
    fieldEdge: 0xa1854a,
    fieldLine: 0xe0c684,
    rock: 0xa89170,
    rockLight: 0xd2bc93,
    foliageStep: 3,
  },
  jungle: {
    ground: 0x54764a,
    ridge: 0x3a5836,
    ridgeLight: 0x466a3f,
    foliage: 0x2f6b34,
    foliageDark: 0x24552a,
    foliageLight: 0x549049,
    road: 0x86714c,
    field: 0x5f7c46,
    fieldEdge: 0x445c32,
    fieldLine: 0x86a463,
    rock: 0x6b7060,
    rockLight: 0x99a189,
    foliageStep: 1,
  },
  snow: {
    ground: 0xc7d8db,
    ridge: 0x9ab2bb,
    ridgeLight: 0xb3c7cd,
    foliage: 0x4f6f5f,
    foliageDark: 0x3f5b4d,
    foliageLight: 0xe4eef0,
    road: 0xafbdc1,
    field: 0xbccbcd,
    fieldEdge: 0x93a4a9,
    fieldLine: 0xe8f1f2,
    rock: 0x8f9aa0,
    rockLight: 0xd3dde0,
    foliageStep: 2,
  },
  islands: {
    ground: 0x82b7b5,
    ridge: 0x64999a,
    ridgeLight: 0x74aaa8,
    foliage: 0x4f8a5e,
    foliageDark: 0x40734d,
    foliageLight: 0x77b07d,
    road: 0xd0bd8c,
    field: 0x8fbf9d,
    fieldEdge: 0x6a9678,
    fieldLine: 0xb8dcbe,
    rock: 0x7d8f8c,
    rockLight: 0xb3c2bd,
    foliageStep: 2,
  },
  volcano: {
    ground: 0x513c35,
    ridge: 0x3a2a25,
    ridgeLight: 0x47332c,
    foliage: 0x4a3a2e,
    foliageDark: 0x362a21,
    foliageLight: 0x6d5039,
    road: 0x6b544a,
    field: 0x5c4640,
    fieldEdge: 0x3f2f2a,
    fieldLine: 0x8a6a55,
    rock: 0x6b5a52,
    rockLight: 0x9c857a,
    foliageStep: 3,
  },
  highland: {
    ground: 0x80938f,
    ridge: 0x60736c,
    ridgeLight: 0x6f847c,
    foliage: 0x577355,
    foliageDark: 0x466046,
    foliageLight: 0x82996f,
    road: 0x9a8f78,
    field: 0x849080,
    fieldEdge: 0x63705f,
    fieldLine: 0xb2bda6,
    rock: 0x8a9490,
    rockLight: 0xbcc4bf,
    foliageStep: 2,
  },
  city: {
    ground: 0xa88d72,
    ridge: 0x866d57,
    ridgeLight: 0x967c63,
    foliage: 0x6b8a52,
    foliageDark: 0x5a7645,
    foliageLight: 0x93ad6d,
    road: 0xc4a982,
    field: 0xac9878,
    fieldEdge: 0x836f53,
    fieldLine: 0xd8c49b,
    rock: 0x9a8d7e,
    rockLight: 0xc6bba9,
    foliageStep: 2,
  },
  capital: {
    ground: 0x91755f,
    ridge: 0x715b48,
    ridgeLight: 0x816952,
    foliage: 0x5f7f4c,
    foliageDark: 0x506b40,
    foliageLight: 0x88a566,
    road: 0xb59a72,
    field: 0x9a8266,
    fieldEdge: 0x74604a,
    fieldLine: 0xc9ae86,
    rock: 0x8d8071,
    rockLight: 0xbcb0a0,
    foliageStep: 2,
  },
};

/** 缺口沿屏障方向的长度，同时决定通道贴图的高度。 */
const PASSAGE_LENGTH = 68;

type PassageStyle = "natural" | "bridge" | "gate";
type BarrierTexture = "blob" | "line" | "spike" | "lava";

interface BarrierStyle {
  body: number;
  bodyLight: number;
  bodyDark: number;
  edge: number;
  passage: number;
  passageEdge: number;
  thickness: number;
  passageStyle: PassageStyle;
  texture: BarrierTexture;
}

/** 草原没有屏障；河谷沿用手绘的河道与木桥，其余关卡按地貌生成阻隔带。 */
const barrierStyles: Partial<Record<Biome, BarrierStyle>> = {
  desert: {
    body: 0xc59a4f,
    bodyLight: 0xdcba71,
    bodyDark: 0x9d7736,
    edge: 0x8d6a30,
    passage: 0x5fa86b,
    passageEdge: 0x3d7a4b,
    thickness: 58,
    passageStyle: "natural",
    texture: "blob",
  },
  jungle: {
    body: 0x1f4a26,
    bodyLight: 0x336b37,
    bodyDark: 0x123016,
    edge: 0x0d240f,
    passage: 0x9a8a61,
    passageEdge: 0x6d6142,
    thickness: 62,
    passageStyle: "gate",
    texture: "blob",
  },
  snow: {
    body: 0xa6cbd8,
    bodyLight: 0xdcf0f6,
    bodyDark: 0x7ba4b6,
    edge: 0x6c94a6,
    passage: 0x9aa5ab,
    passageEdge: 0x6f7b7a,
    thickness: 58,
    passageStyle: "natural",
    texture: "blob",
  },
  islands: {
    body: 0x3f7f96,
    bodyLight: 0x6aabbf,
    bodyDark: 0x2b5d72,
    edge: 0x244f61,
    passage: 0xa8834f,
    passageEdge: 0x74582f,
    thickness: 66,
    passageStyle: "bridge",
    texture: "line",
  },
  volcano: {
    body: 0x8c2f1e,
    bodyLight: 0xff8a34,
    bodyDark: 0x4e170d,
    edge: 0x37100a,
    passage: 0x7b6a60,
    passageEdge: 0x4f423a,
    thickness: 54,
    passageStyle: "bridge",
    texture: "lava",
  },
  highland: {
    body: 0x5c6c64,
    bodyLight: 0x86968c,
    bodyDark: 0x404d47,
    edge: 0x36423c,
    passage: 0x93a09a,
    passageEdge: 0x64716b,
    thickness: 60,
    passageStyle: "natural",
    texture: "spike",
  },
  city: {
    body: 0x93866f,
    bodyLight: 0xaea08a,
    bodyDark: 0x6d6250,
    edge: 0x554b3b,
    passage: 0x7a6045,
    passageEdge: 0x4f3d2b,
    thickness: 52,
    passageStyle: "gate",
    texture: "line",
  },
  capital: {
    body: 0x836f58,
    bodyLight: 0xa08a6e,
    bodyDark: 0x5f4f3d,
    edge: 0x483b2c,
    passage: 0xb99a5e,
    passageEdge: 0x7d6435,
    thickness: 54,
    passageStyle: "gate",
    texture: "line",
  },
};

export interface RenderState {
  forts: readonly Fort[];
  squads: readonly Squad[];
  selection: InputSelection;
  dispatchRatio: number;
  shielded: readonly number[];
  playerPace: number;
  objective: ObjectiveView;
  fieldSelection?: {
    squad: number;
    pointer: Point;
    target: number;
  };
  projectiles?: readonly {
    from: Point;
    to: Point;
    remaining: number;
    duration: number;
  }[];
}

export class GameRenderer {
  private readonly actors = new Graphics();
  private readonly overlay = new Graphics();
  private readonly status: Text;
  private readonly score: Text;
  private readonly unitLabels: Text[];
  private readonly compositionLabels: Text[];
  private readonly cappedFlags: boolean[];

  constructor(
    app: Application,
    private readonly level: RenderLevel,
    forts: readonly Fort[],
  ) {
    const map = new Container();
    const hud = new Container();
    const background = new Graphics();
    map.addChild(background, this.actors, this.overlay);
    app.stage.addChild(map, hud);

    // 浅色描边保证深色地貌（火山、雨林）上的 HUD 依然可读。
    const outline = { color: "#f6e6c2", width: 4, join: "round" } as const;
    this.status = new Text({
      text: `第 ${level.id} 关：${level.briefing}`,
      style: new TextStyle({ fill: "#4c321e", fontSize: 15, fontWeight: "600", stroke: outline }),
    });
    this.score = new Text({
      text: "",
      style: new TextStyle({ fill: "#3a271b", fontSize: 19, fontWeight: "bold", stroke: outline }),
    });
    this.status.position.set(24, 22);
    this.score.anchor.set(1, 0);
    this.score.position.set(GAME_WIDTH - 24, 20);

    this.unitLabels = forts.map((fort) => {
      const label = new Text({
        text: String(Math.floor(fort.soldiers)),
        style: new TextStyle({ fill: "#fff4d5", fontSize: 16, fontWeight: "bold" }),
      });
      label.anchor.set(0.5);
      label.position.set(fort.x, fort.y + 4);
      return label;
    });
    this.compositionLabels = forts.map((fort) => {
      const label = new Text({
        text: fortCompositionText(fort),
        style: new TextStyle({
          fill: "#3a271b",
          fontSize: 10,
          fontWeight: "700",
          stroke: { color: "#f6e6c2", width: 3, join: "round" },
        }),
      });
      label.anchor.set(0.5);
      label.position.set(fort.x, fort.y + fortStyles[fort.kind].radius + 11);
      return label;
    });
    this.cappedFlags = forts.map(() => false);
    hud.addChild(this.status, this.score, ...this.unitLabels, ...this.compositionLabels);
    this.drawBackground(background);
  }

  setStatus(message: string) {
    this.status.text = message;
  }

  render({
    forts,
    squads,
    selection,
    dispatchRatio,
    shielded,
    playerPace,
    objective,
    fieldSelection,
    projectiles = [],
  }: RenderState) {
    this.actors.clear();
    for (const [index, fort] of forts.entries()) {
      this.drawFort(fort, shielded.includes(index));
      this.unitLabels[index].text = String(Math.floor(fort.soldiers));
      this.compositionLabels[index].text = fortCompositionText(fort);

      const capped = fort.soldiers >= fortProfiles[fort.kind].capacity;
      if (this.cappedFlags[index] !== capped) {
        this.cappedFlags[index] = capped;
        this.unitLabels[index].style.fill = capped ? "#ffd76a" : "#fff4d5";
      }
    }

    for (const squad of squads) this.drawSquad(squad);

    this.overlay.clear();
    this.drawObjectiveTargets(forts, objective);
    this.drawProjectiles(projectiles);
    if (selection.source >= 0) {
      const source = forts[selection.source];
      const soldiers = dispatchCount(source.soldiers, dispatchRatio);
      const target = selection.target >= 0 ? forts[selection.target] : null;
      const composition =
        source.composition && source.soldiers > 0
          ? ` · ${compositionText({
              infantry: source.composition.infantry * (soldiers / source.soldiers),
              archer: source.composition.archer * (soldiers / source.soldiers),
              cavalry: source.composition.cavalry * (soldiers / source.soldiers),
            })}`
          : "";
      const summary = `出兵预览：${Math.round(dispatchRatio * 100)}%（${soldiers} 人${composition}，留守 ${Math.floor(source.soldiers) - soldiers} 人）`;

      this.status.text = target
        ? `${summary} · ${this.drawRoutePreview(source, target, playerPace)}`
        : summary;

      if (!target) {
        this.overlay
          .moveTo(source.x, source.y)
          .lineTo(selection.pointer.x, selection.pointer.y)
          .stroke({ color: colors.player, width: 4, alpha: 0.8 })
          .circle(selection.pointer.x, selection.pointer.y, 7)
          .fill(colors.player);
      }
    }
    if (fieldSelection && fieldSelection.squad >= 0) {
      const squad = squads[fieldSelection.squad];
      if (squad) {
        const target =
          fieldSelection.target >= 0 ? forts[fieldSelection.target] : fieldSelection.pointer;
        const route = createRoute(squad, target, this.level.waypoints);
        this.drawDashes(route, 0xffd76a);
        this.overlay
          .circle(squad.x, squad.y, 22)
          .stroke({ color: 0xffd76a, width: 3 })
          .circle(target.x, target.y, 10)
          .stroke({ color: 0xffd76a, width: 3 });
        const unit = squad.unitType ? UNIT_SHORT[squad.unitType] : "军";
        this.status.text = `${unit}兵编队改道预览：拖向地面可驻防，拖向堡垒可增援或进攻。`;
      }
    }

    this.score.text = `第 ${this.level.id} 关 ${this.level.name} · 蓝军 ${forts.filter((f) => f.faction === "player").length} 座 · 红军 ${forts.filter((f) => f.faction === "ai").length} 座`;
  }

  private drawProjectiles(
    projectiles: readonly {
      from: Point;
      to: Point;
      remaining: number;
      duration: number;
    }[],
  ) {
    for (const projectile of projectiles) {
      const progress = 1 - projectile.remaining / projectile.duration;
      const x = projectile.from.x + (projectile.to.x - projectile.from.x) * progress;
      const y = projectile.from.y + (projectile.to.y - projectile.from.y) * progress;
      const angle = Math.atan2(
        projectile.to.y - projectile.from.y,
        projectile.to.x - projectile.from.x,
      );
      this.overlay
        .moveTo(x - Math.cos(angle) * 10, y - Math.sin(angle) * 10)
        .lineTo(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4)
        .stroke({ color: 0xf5e5a4, width: 2.5, alpha: 0.95 });
    }
  }

  private drawObjectiveTargets(forts: readonly Fort[], objective: ObjectiveView) {
    const color = objective.state === "contested" ? 0xff8f43 : 0xffd76a;
    for (const targetIndex of objective.targetForts) {
      const target = forts[targetIndex];
      if (!target) continue;
      const radius = fortStyles[target.kind].radius;
      this.overlay
        .circle(target.x, target.y, radius + 9)
        .stroke({ color, width: 4, alpha: 0.95 })
        .circle(target.x, target.y, radius + 15)
        .stroke({ color, width: 2, alpha: 0.55 })
        .poly([
          target.x,
          target.y - radius - 29,
          target.x + 8,
          target.y - radius - 21,
          target.x,
          target.y - radius - 13,
          target.x - 8,
          target.y - radius - 21,
        ])
        .fill(color);
    }
  }

  /** 画出部队真正会走的路线，并返回一句给状态栏用的摘要。 */
  private drawRoutePreview(source: Fort, target: Fort, playerPace: number) {
    const route = createRoute(source, target, this.level.waypoints);
    const reinforcing = target.faction === source.faction;
    const color = reinforcing ? ROUTE_COLORS.reinforce : ROUTE_COLORS.attack;
    const detours = route.length - 2;

    this.drawDashes(route, color);
    for (let index = 1; index < route.length - 1; index++) {
      const node = route[index];
      this.overlay
        .circle(node.x, node.y, 13)
        .stroke({ color: ROUTE_COLORS.waypoint, width: 3 })
        .circle(node.x, node.y, 5)
        .fill(ROUTE_COLORS.waypoint);
    }
    this.overlay
      .circle(target.x, target.y, fortStyles[target.kind].radius + 7)
      .stroke({ color, width: 3, alpha: 0.95 });

    const seconds = Math.max(1, Math.round(routeDistance(route) / playerPace));
    const action = reinforcing ? "增援" : "进攻";
    return detours > 0
      ? `${action}需绕行 ${detours} 处必经节点，约 ${seconds} 秒抵达`
      : `${action}可直取，约 ${seconds} 秒抵达`;
  }

  private drawDashes(route: readonly Point[], color: number) {
    const dash = 12;
    const gap = 8;
    for (let index = 1; index < route.length; index++) {
      const from = route[index - 1];
      const to = route[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length <= 0) continue;
      const stepX = (to.x - from.x) / length;
      const stepY = (to.y - from.y) / length;
      for (let offset = 0; offset < length; offset += dash + gap) {
        const end = Math.min(offset + dash, length);
        this.overlay
          .moveTo(from.x + stepX * offset, from.y + stepY * offset)
          .lineTo(from.x + stepX * end, from.y + stepY * end);
      }
    }
    this.overlay.stroke({ color, width: 5, alpha: 0.9 });
  }

  private drawFort(fort: Fort, shielded: boolean) {
    const { x, y } = fort;
    const color = colors[fort.faction];
    const style = fortStyles[fort.kind];

    if (fort.specialization) {
      const badgeX = x - style.radius + 5;
      const badgeY = y - style.radius + 7;
      this.actors
        .circle(badgeX, badgeY, 9)
        .fill(0x2b2119)
        .circle(badgeX, badgeY, 6)
        .fill(UNIT_COLORS[fort.specialization]);
    }
    this.actors
      .circle(x, y, style.radius)
      .fill(0x5b4937)
      .circle(x, y, style.radius - 5)
      .fill(color)
      .circle(x, y, style.radius - 12)
      .fill(0xe3d0a5);
    if (style.wall) {
      this.actors.circle(x, y, style.radius - 8).stroke({ color: 0x4a3728, width: 3, alpha: 0.85 });
    }

    this.actors
      .rect(x - 3, y - style.mast, 6, style.mast - 8)
      .fill(0x4a3728)
      .poly([x + 3, y - style.mast + 1, x + 28, y - style.mast + 9, x + 3, y - style.mast + 19])
      .fill(color);

    const half = style.radius * 0.58;
    this.actors.roundRect(x - half, y - 11, half * 2, 25, 3).fill(0x735a42);
    for (let tower = 0; tower < style.towers; tower++) {
      const offset = (tower - (style.towers - 1) / 2) * 13;
      this.actors.rect(x + offset - 4.5, y - 18, 9, 12).fill(0x907151);
    }

    if (shielded) {
      this.actors
        .circle(x, y, style.radius + 6)
        .stroke({ color: 0x9ad7ff, width: 3, alpha: 0.9 })
        .circle(x, y, style.radius + 11)
        .stroke({ color: 0x9ad7ff, width: 1.5, alpha: 0.45 });
    }
  }

  private visualUnit(army: ArmyComposition, index: number, count: number): UnitType {
    const total = UNIT_ORDER.reduce((sum, unit) => sum + army[unit], 0);
    if (total <= 0) return "infantry";
    const position = ((index + 0.5) / count) * total;
    let cursor = 0;
    for (const unit of UNIT_ORDER) {
      cursor += army[unit];
      if (position <= cursor) return unit;
    }
    return "cavalry";
  }

  private drawUnitInsignia(squad: Squad, unit: UnitType) {
    const x = squad.x;
    const y = squad.y - 29;
    this.actors.circle(x, y, 11).fill(0x241a13).stroke({
      color: colors[squad.faction],
      width: 2.5,
    });
    if (unit === "infantry") {
      this.actors
        .roundRect(x - 5, y - 6, 10, 12, 3)
        .fill(UNIT_COLORS.infantry)
        .moveTo(x, y - 5)
        .lineTo(x, y + 5)
        .stroke({ color: 0x4b6070, width: 1.5 });
    } else if (unit === "archer") {
      this.actors
        .moveTo(x - 4, y - 6)
        .lineTo(x + 2, y)
        .lineTo(x - 4, y + 6)
        .stroke({ color: UNIT_COLORS.archer, width: 2.5 })
        .moveTo(x - 1, y)
        .lineTo(x + 7, y)
        .stroke({ color: 0xe7d6a3, width: 1.5 });
    } else {
      this.actors
        .poly([x, y - 7, x + 7, y, x, y + 7, x - 7, y])
        .fill(UNIT_COLORS.cavalry)
        .circle(x + 2, y - 1, 2.5)
        .fill(0x5d3d29);
    }
  }

  private drawSquad(squad: Squad) {
    const target = squad.route[Math.min(squad.next, squad.route.length - 1)];
    const direction = Math.atan2(target.y - squad.y, target.x - squad.x);
    const primaryUnit = squad.unitType ?? null;
    const count =
      primaryUnit === "cavalry"
        ? Math.min(7, Math.max(2, Math.ceil(squad.soldiers / 8)))
        : primaryUnit
          ? Math.min(12, Math.max(3, Math.ceil(squad.soldiers / 6)))
          : Math.min(18, Math.max(3, Math.ceil(squad.soldiers / 4)));
    const forwardX = Math.cos(direction);
    const forwardY = Math.sin(direction);
    const sideX = -forwardY;
    const sideY = forwardX;

    if (squad.stance === "shield") {
      this.actors
        .circle(squad.x, squad.y, 24)
        .stroke({ color: UNIT_COLORS.infantry, width: 3, alpha: 0.75 });
    } else if (squad.stance === "firing") {
      this.actors
        .circle(squad.x, squad.y, 23)
        .stroke({ color: UNIT_COLORS.archer, width: 2, alpha: 0.65 });
    } else if (squad.stance === "charging") {
      this.actors
        .moveTo(squad.x - forwardX * 36, squad.y - forwardY * 36)
        .lineTo(squad.x - forwardX * 8, squad.y - forwardY * 8)
        .stroke({ color: UNIT_COLORS.cavalry, width: 8, alpha: 0.3 });
    }
    if (primaryUnit) this.drawUnitInsignia(squad, primaryUnit);

    const columns = primaryUnit === "cavalry" ? 3 : primaryUnit === "archer" ? 4 : 5;
    const sideSpacing =
      primaryUnit === "cavalry" ? 15 : primaryUnit === "archer" ? 12 : primaryUnit ? 10 : 7;
    const rowSpacing =
      primaryUnit === "cavalry" ? 17 : primaryUnit === "archer" ? 13 : primaryUnit ? 11 : 8;
    const modelScale = primaryUnit ? 1.4 : 1;

    for (let index = 0; index < count; index++) {
      const unit =
        primaryUnit ??
        (squad.composition ? this.visualUnit(squad.composition, index, count) : null);
      const row = Math.floor(index / columns);
      const column = index % columns;
      const side = (column - (columns - 1) / 2) * sideSpacing;
      const wedge = primaryUnit === "cavalry" ? Math.abs(column - (columns - 1) / 2) * 3 : 0;
      const back = row * rowSpacing + wedge;
      const step = Math.sin(squad.phase * 10 + index * 0.91);
      const x = squad.x + sideX * side - forwardX * back;
      const y = squad.y + sideY * side - forwardY * back + step * 0.7;
      const point = (forward: number, lateral: number) => ({
        x: x + forwardX * forward * modelScale + sideX * lateral * modelScale,
        y: y + forwardY * forward * modelScale + sideY * lateral * modelScale,
      });
      if (unit === "cavalry") {
        const nose = point(8, 0);
        const left = point(1, 4.5);
        const tail = point(-8, 0);
        const right = point(1, -4.5);
        const rider = point(1, 0);
        const head = point(5, 0);
        this.actors
          .ellipse(x - forwardX * 2, y - forwardY * 2 + 5, 8 * modelScale, 3 * modelScale)
          .fill({ color: 0x4a3728, alpha: 0.22 })
          .poly([nose.x, nose.y, left.x, left.y, tail.x, tail.y, right.x, right.y])
          .fill(0x775038)
          .stroke({ color: 0x3c291f, width: 1.5 })
          .circle(rider.x, rider.y - 1, 4 * modelScale)
          .fill(colors[squad.faction])
          .circle(head.x, head.y - 3, 2.5 * modelScale)
          .fill(0xffd8aa)
          .circle(rider.x, rider.y + 3, 2.2 * modelScale)
          .fill(UNIT_COLORS.cavalry);
        continue;
      }

      const head = point(4, 0);
      const chest = point(0, 0);
      const waist = point(-2.5, 0);
      const leftFoot = point(-5.5 + step * 1.4, 1.4);
      const rightFoot = point(-5.5 - step * 1.4, -1.4);
      const equipment = point(-0.5, 3);
      const shadow = point(-3, 0);
      this.actors
        .ellipse(shadow.x, shadow.y + 3, 4.4 * modelScale, 1.7 * modelScale)
        .fill({ color: 0x4a3728, alpha: 0.22 })
        .moveTo(waist.x, waist.y)
        .lineTo(leftFoot.x, leftFoot.y)
        .stroke({ color: 0x39291f, width: 2 })
        .moveTo(waist.x, waist.y)
        .lineTo(rightFoot.x, rightFoot.y)
        .stroke({ color: 0x39291f, width: 2 })
        .circle(chest.x, chest.y, 3.6 * modelScale)
        .fill(0x241b16)
        .circle(chest.x - 0.7, chest.y - 1, 3.1 * modelScale)
        .fill(colors[squad.faction])
        .circle(head.x, head.y, 2.6 * modelScale)
        .fill(0x49372a)
        .circle(head.x, head.y + 1, 2.2 * modelScale)
        .fill(0xffd8aa);

      if (unit === "infantry") {
        const spearBack = point(-4, -3);
        const spearTip = point(11, -3);
        this.actors
          .circle(equipment.x, equipment.y, 3.5 * modelScale)
          .fill(UNIT_COLORS.infantry)
          .stroke({ color: 0x465b6c, width: 1 })
          .moveTo(spearBack.x, spearBack.y)
          .lineTo(spearTip.x, spearTip.y)
          .stroke({ color: 0x59422f, width: 1.5 });
      } else if (unit === "archer") {
        const bowTop = point(3, 4);
        const bowMiddle = point(0, 5.5);
        const bowBottom = point(-3, 4);
        const arrowTip = point(9, 4);
        this.actors
          .moveTo(bowTop.x, bowTop.y)
          .lineTo(bowMiddle.x, bowMiddle.y)
          .lineTo(bowBottom.x, bowBottom.y)
          .stroke({ color: UNIT_COLORS.archer, width: 1.8 })
          .moveTo(bowMiddle.x, bowMiddle.y)
          .lineTo(arrowTip.x, arrowTip.y)
          .stroke({ color: 0x59422f, width: 1.2 });
      } else {
        this.actors
          .circle(equipment.x, equipment.y, 2.4)
          .fill(0xd7bd83)
          .stroke({ color: 0x6d5136, width: 1 });
      }
    }
  }

  private drawBackground(background: Graphics) {
    const palette = palettes[this.level.biome];
    background.clear().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(palette.ground);
    background
      .poly([
        0, 95, 90, 48, 190, 96, 288, 40, 390, 92, 500, 50, 610, 108, 720, 42, 850, 104, 960, 38,
        1100, 96, 1100, 0, 0, 0,
      ])
      .fill(palette.ridge);
    background
      .poly([
        0, 116, 90, 74, 190, 116, 288, 65, 390, 112, 500, 78, 610, 129, 720, 66, 850, 122, 960, 66,
        1100, 118, 1100, 89, 960, 38, 850, 104, 720, 42, 610, 108, 500, 50, 390, 92, 288, 40, 190,
        96, 90, 48, 0, 95,
      ])
      .fill(palette.ridgeLight);

    for (const [x, y] of [
      [95, 490],
      [180, 520],
      [890, 480],
      [970, 440],
    ]) {
      background
        .roundRect(x, y, 74, 42, 5)
        .fill(palette.field)
        .stroke({ color: palette.fieldEdge, width: 1, alpha: 0.7 });
      for (let row = 0; row < 3; row++)
        background
          .moveTo(x + 8, y + 9 + row * 11)
          .lineTo(x + 66, y + 9 + row * 11)
          .stroke({ color: palette.fieldLine, width: 1, alpha: 0.8 });
    }
    background
      .moveTo(40, 360)
      .bezierCurveTo(230, 335, 335, 385, 462, 420)
      .stroke({ color: palette.road, width: 10, alpha: 0.75 })
      .moveTo(730, 330)
      .bezierCurveTo(835, 305, 925, 275, 1070, 295)
      .stroke({ color: palette.road, width: 10, alpha: 0.75 });

    this.drawBarrier(background);

    const foliage = [
      [65, 170],
      [120, 200],
      [205, 278],
      [250, 305],
      [370, 105],
      [420, 130],
      [755, 105],
      [820, 122],
      [1015, 185],
      [1060, 220],
      [75, 580],
      [150, 565],
      [270, 575],
      [865, 560],
      [960, 545],
      [1020, 585],
      [380, 535],
    ].filter((_, index) => index % palette.foliageStep === 0);
    for (const [x, y] of foliage) {
      background
        .ellipse(x + 6, y + 9, 27, 16)
        .fill({ color: palette.foliageDark, alpha: 0.22 })
        .circle(x, y, 25)
        .fill(palette.foliage)
        .circle(x - 12, y + 4, 17)
        .fill(palette.foliageLight)
        .circle(x + 12, y + 5, 17)
        .fill(palette.foliageDark)
        .circle(x - 6, y - 9, 13)
        .fill({ color: palette.foliageLight, alpha: 0.55 });
    }
    for (const [x, y] of [
      [165, 365],
      [310, 245],
      [445, 490],
      [735, 500],
      [936, 95],
      [1020, 345],
    ]) {
      background
        .ellipse(x, y, 12, 7)
        .fill(palette.rock)
        .ellipse(x - 3, y - 2, 7, 3)
        .fill(palette.rockLight);
    }
  }

  /** 把 createRoute 依赖的那条隐形屏障画成看得见的地形，并在必经节点处开出通道。 */
  private drawBarrier(background: Graphics) {
    const { waypoints, biome } = this.level;
    if (!waypoints.length) return;

    if (biome === "river") {
      this.drawRiver(background);
      return;
    }
    const style = barrierStyles[biome];
    if (!style) return;

    const segments = this.barrierSegments();
    for (const [from, to] of segments) {
      background.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    background.stroke({ color: style.edge, width: style.thickness + 10, cap: "round" });
    for (const [from, to] of segments) {
      background.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    background.stroke({ color: style.body, width: style.thickness, cap: "round" });

    this.textureBarrier(background, segments, style);
    for (const node of waypoints) this.drawPassage(background, node, style);
  }

  /** 沿屏障脊线撒上地貌纹理，让它看起来是地形而不是一堵纯色的墙。 */
  private textureBarrier(background: Graphics, segments: [Point, Point][], style: BarrierStyle) {
    const spacing = style.texture === "line" ? 15 : 27;
    const reach = style.thickness / 2;
    let tick = 0;

    for (const [from, to] of segments) {
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length <= 0) continue;
      const stepX = (to.x - from.x) / length;
      const stepY = (to.y - from.y) / length;
      const normalX = -stepY;
      const normalY = stepX;

      if (style.texture === "lava") {
        background
          .moveTo(from.x, from.y)
          .lineTo(to.x, to.y)
          .stroke({ color: style.bodyLight, width: reach * 0.7, alpha: 0.85 })
          .moveTo(from.x, from.y)
          .lineTo(to.x, to.y)
          .stroke({ color: 0xffd27a, width: reach * 0.26, alpha: 0.8 });
        continue;
      }

      for (let offset = spacing * 0.6; offset < length; offset += spacing) {
        const x = from.x + stepX * offset;
        const y = from.y + stepY * offset;
        const swing = ((tick % 3) - 1) * reach * 0.46;
        const px = x + normalX * swing;
        const py = y + normalY * swing;
        const shade = tick % 2 === 0 ? style.bodyLight : style.bodyDark;

        if (style.texture === "blob") {
          background.circle(px, py, reach * 0.44).fill({ color: shade, alpha: 0.9 });
        } else if (style.texture === "spike") {
          background
            .poly([
              px - normalX * reach * 0.5 - stepX * 9,
              py - normalY * reach * 0.5 - stepY * 9,
              px + normalX * reach * 0.62,
              py + normalY * reach * 0.62,
              px - normalX * reach * 0.5 + stepX * 9,
              py - normalY * reach * 0.5 + stepY * 9,
            ])
            .fill({ color: shade, alpha: 0.92 });
        } else {
          background
            .moveTo(px - normalX * reach * 0.82, py - normalY * reach * 0.82)
            .lineTo(px + normalX * reach * 0.82, py + normalY * reach * 0.82)
            .stroke({ color: shade, width: 3, alpha: 0.55 });
        }
        tick++;
      }
    }
  }

  /** 屏障脊线穿过每个必经节点，两端伸出画面，缺口因此正好落在节点上。 */
  private barrierSegments(gap = PASSAGE_LENGTH): [Point, Point][] {
    const waypoints = this.level.waypoints;
    const barrierX = waypoints.reduce((total, point) => total + point.x, 0) / waypoints.length;
    const spine: Point[] = [
      { x: barrierX, y: -40 },
      ...[...waypoints].sort((a, b) => a.y - b.y),
      { x: barrierX, y: GAME_HEIGHT + 40 },
    ];

    const segments: [Point, Point][] = [];
    for (let index = 1; index < spine.length; index++) {
      const from = spine[index - 1];
      const to = spine[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length <= 0) continue;
      const stepX = (to.x - from.x) / length;
      const stepY = (to.y - from.y) / length;
      const trimStart = index === 1 ? 0 : gap / 2;
      const trimEnd = index === spine.length - 1 ? 0 : gap / 2;
      if (trimStart + trimEnd >= length) continue;
      segments.push([
        { x: from.x + stepX * trimStart, y: from.y + stepY * trimStart },
        { x: to.x - stepX * trimEnd, y: to.y - stepY * trimEnd },
      ]);
    }
    return segments;
  }

  private drawPassage(background: Graphics, node: Point, style: BarrierStyle) {
    const width = style.thickness + 16;
    const height = PASSAGE_LENGTH;
    const left = node.x - width / 2;
    const top = node.y - height / 2;

    background.roundRect(left, top, width, height, 7).fill(style.passage);

    if (style.passageStyle === "gate") {
      for (const side of [-1, 1]) {
        const y = side < 0 ? top - 6 : top + height - 16;
        background
          .roundRect(left - 7, y, width + 14, 22, 3)
          .fill(style.passageEdge)
          .rect(left - 7, y, width + 14, 5)
          .fill({ color: 0xffffff, alpha: 0.14 });
      }
    } else if (style.passageStyle === "bridge") {
      for (let plank = left + 5; plank < left + width - 4; plank += 10) {
        background.rect(plank, top + 5, 5, height - 10).fill(style.passageEdge);
      }
      for (const side of [-1, 1]) {
        background.rect(left, side < 0 ? top : top + height - 5, width, 5).fill(style.passageEdge);
      }
    } else {
      for (const side of [-1, 1]) {
        const y = node.y + (side * height) / 2;
        background
          .circle(node.x - 15, y - side * 7, 10)
          .fill(style.passageEdge)
          .circle(node.x + 13, y - side * 10, 8)
          .fill(style.passageEdge)
          .circle(node.x + 1, y - side * 4, 6)
          .fill({ color: style.passageEdge, alpha: 0.75 });
      }
    }
  }

  private drawRiver(background: Graphics) {
    background
      .moveTo(505, -10)
      .bezierCurveTo(450, 120, 600, 172, 530, 290)
      .bezierCurveTo(465, 405, 615, 476, 565, 630)
      .lineTo(680, 630)
      .bezierCurveTo(740, 475, 585, 396, 650, 283)
      .bezierCurveTo(720, 160, 580, 115, 635, -10)
      .closePath()
      .fill(0x7cb7c1);
    background
      .moveTo(552, -10)
      .bezierCurveTo(510, 123, 650, 181, 578, 290)
      .bezierCurveTo(510, 405, 663, 473, 610, 630)
      .stroke({ color: 0xc5e0d2, width: 3, alpha: 0.6 });
    for (const y of [205, 430]) {
      background.roundRect(485, y, 205, 18, 3).fill(0x785239).stroke({ color: 0x4f3626, width: 2 });
      for (let x = 493; x < 683; x += 16) background.rect(x, y + 2, 3, 14).fill(0xc39760);
    }
  }
}
