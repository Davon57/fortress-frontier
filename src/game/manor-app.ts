import { ManorSimulation, type BuildingKind } from "./manor-simulation";
import "../manor.css";
import { Application, Graphics } from "pixi.js";
import { mountManorThree } from "./manor-three";

const names: Record<BuildingKind, string> = {
  house: "民居",
  lumberyard: "伐木营",
  forager: "采集棚",
  farm: "农田",
  granary: "粮仓",
  smithy: "铁匠铺",
  watchtower: "瞭望塔",
};
export const mountManorGame = async () => {
  mountManorThree();
  return;
  const sim = new ManorSimulation();
  document.title = "领主的土地";
  document.body.innerHTML = `<main class="manor"><header><a href="/">← 游戏首页</a><div><b id="season"></b><span id="day"></span> · <span id="health"></span></div></header><section class="manor__map"><div id="manor-canvas"></div></section><section class="manor__hud"><div><div id="stats"></div><div id="buildings" class="manor__buildings"></div></div><div class="manor__actions" id="actions"></div><button id="recruit">征召民兵</button></section><aside><h2>领地日志</h2><div id="log"></div></aside></main>`;
  const app = new Application();
  await app.init({
    width: 1060,
    height: 570,
    antialias: true,
    background: "#77945d",
    resolution: Math.min(devicePixelRatio, 2),
  });
  document.querySelector("#manor-canvas")!.append(app.canvas);
  const scene = new Graphics();
  app.stage.addChild(scene);
  const iso = (x: number, y: number) => ({ x: 530 + (x - y) * 42, y: 95 + (x + y) * 22 });
  const buildingPositions: Record<BuildingKind, [number, number][]> = {
    house: [
      [3, 3],
      [5, 4],
      [2, 5],
      [6, 2],
    ],
    lumberyard: [
      [2, 1],
      [1, 3],
    ],
    forager: [
      [7, 1],
      [8, 3],
    ],
    farm: [
      [5, 6],
      [7, 6],
    ],
    granary: [[4, 2]],
    smithy: [[6, 4]],
    watchtower: [[8, 5]],
  };
  const draw = (time: number) => {
    scene.clear();
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 11; x++) {
        const p = iso(x, y);
        scene
          .poly([p.x, p.y, p.x + 42, p.y + 22, p.x, p.y + 44, p.x - 42, p.y + 22])
          .fill((x + y) % 2 ? 0x8fa967 : 0x9db574)
          .stroke({ color: 0x6c8550, width: 1, alpha: 0.35 });
      }
    // 主路、溪流和树林让村庄有明确的空间层次。
    for (let i = 0; i < 9; i++) {
      const p = iso(i, 4);
      scene.poly([p.x, p.y, p.x + 42, p.y + 22, p.x, p.y + 44, p.x - 42, p.y + 22]).fill(0xb99967);
    }
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 6],
      [9, 1],
      [10, 3],
      [9, 7],
    ]) {
      const p = iso(x, y);
      scene
        .circle(p.x, p.y + 8, 18)
        .fill(0x3f6b38)
        .circle(p.x - 10, p.y + 2, 13)
        .fill(0x527d43)
        .circle(p.x + 11, p.y + 1, 12)
        .fill(0x315c34);
    }
    (Object.keys(names) as BuildingKind[]).forEach(
      (kind) =>
        sim.state.buildings[kind] &&
        buildingPositions[kind].slice(0, sim.state.buildings[kind]).forEach(([x, y]) => {
          const p = iso(x, y);
          const color =
            kind === "farm"
              ? 0xd8bd59
              : kind === "lumberyard"
                ? 0x805537
                : kind === "smithy"
                  ? 0x57525a
                  : 0xa9744e;
          scene
            .poly([p.x - 26, p.y + 12, p.x, p.y - 4, p.x + 26, p.y + 12, p.x, p.y + 29])
            .fill(color)
            .stroke({ color: 0x453321, width: 2 });
          scene
            .poly([p.x - 29, p.y + 10, p.x, p.y - 12, p.x + 29, p.y + 10, p.x, p.y + 22])
            .fill(kind === "farm" ? 0xe2d070 : 0x693f2b);
        }),
    );
    for (let i = 0; i < sim.state.population; i++) {
      const a = time / 550 + i * 1.8;
      const p = iso(3 + Math.sin(a) * 2, 4 + Math.cos(a * 0.7) * 2);
      scene
        .circle(p.x, p.y + 10, 5)
        .fill(i < sim.state.militia ? 0x466f9d : 0xead0a2)
        .circle(p.x, p.y + 4, 3)
        .fill(0x4a3326);
    }
  };
  const kinds = Object.keys(names) as BuildingKind[];
  document.querySelector("#actions")!.innerHTML = kinds
    .map((k) => `<button data-build="${k}">建造${names[k]}</button>`)
    .join("");
  const render = () => {
    const s = sim.state;
    document.querySelector("#season")!.textContent = `${s.season}季`;
    document.querySelector("#day")!.textContent = ` 第 ${s.day} 日 · 劫掠 ${s.raidIn} 日后`;
    document.querySelector("#health")!.textContent = `宅邸耐久 ${Math.max(0, s.manorHealth)}`;
    document.querySelector("#stats")!.innerHTML =
      `人口 ${s.population} · 劳力 ${s.workers} · 民兵 ${s.militia}<br>粮食 ${Math.floor(s.food)}　木材 ${Math.floor(s.wood)}　工具 ${Math.floor(s.tools)}　影响力 ${Math.floor(s.influence)}`;
    document.querySelector("#buildings")!.innerHTML = kinds
      .filter((k) => s.buildings[k])
      .map((k) => `<span>${names[k]} ×${s.buildings[k]}</span>`)
      .join("");
    document.querySelector("#log")!.innerHTML = s.log
      .slice(0, 4)
      .map((x) => `<p>${x}</p>`)
      .join("");
  };
  document.querySelectorAll<HTMLButtonElement>("[data-build]").forEach(
    (b) =>
      (b.onclick = () => {
        sim.build(b.dataset.build as BuildingKind);
        render();
      }),
  );
  document.querySelector<HTMLButtonElement>("#recruit")!.onclick = () => {
    sim.recruit();
    render();
  };
  render();
  draw(0);
  app.ticker.add(() => draw(performance.now()));
  setInterval(() => {
    sim.update(1);
    render();
  }, 1000);
};
