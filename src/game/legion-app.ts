import { Application } from "pixi.js";
import { LegionInputController } from "./legion-input";
import { armyTotal, unitOrder, unitProfiles } from "./legion-logic";
import { getLegionLevel, legionLevels } from "./legion-levels";
import { LegionSimulation } from "./legion-simulation";
import { DISPATCH_PRESETS } from "./logic";
import { GameRenderer, GAME_HEIGHT, GAME_WIDTH } from "./renderer";
import { terrainEffects } from "./terrain";
import type { ArmyComposition, UnitType } from "./types";
import { setupShellPanels } from "../layout-controller";

const STORAGE_KEY = "fortress-legion-unlocked";

const readUnlocked = () => {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY) || 1);
    return Number.isFinite(value)
      ? Math.max(1, Math.min(legionLevels.length, Math.trunc(value)))
      : 1;
  } catch {
    return 1;
  }
};

const unlockAfterVictory = (levelId: number) => {
  const unlocked = Math.max(readUnlocked(), Math.min(legionLevels.length, levelId + 1));
  try {
    localStorage.setItem(STORAGE_KEY, String(unlocked));
  } catch {
    // 存储不可用时仍允许军团战役继续结算。
  }
  return unlocked;
};

const unitClass = (unit: UnitType) => `unit-${unit}`;

const armyMarkup = (army: ArmyComposition) =>
  unitOrder
    .map(
      (unit) =>
        `<span class="army-chip ${unitClass(unit)}"><b>${unitProfiles[unit].shortName}</b>${Math.floor(army[unit])}</span>`,
    )
    .join("");

export const mountLegionGame = async () => {
  document.title = "堡垒前线：军团模式";
  document.querySelector<HTMLElement>("#mission-panel .side-panel__title")!.textContent =
    "军团简报";
  document.querySelector<HTMLElement>("#campaign-panel .side-panel__title")!.textContent =
    "军团战役";

  const selectedLevel = Number(new URLSearchParams(location.search).get("level") || "1");
  const level = getLegionLevel(selectedLevel);
  const simulation = new LegionSimulation(level);
  const terrain = terrainEffects[level.biome];
  const unlocked = readUnlocked();

  const app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    antialias: true,
    background: "#d8c69b",
    resolution: Math.min(devicePixelRatio, 2),
  });
  document.querySelector<HTMLDivElement>("#app")!.append(app.canvas);

  const renderer = new GameRenderer(app, level, simulation.renderForts);
  const initialObjective = simulation.objectiveView;

  document.querySelector<HTMLElement>("#battle-header")!.innerHTML = `
    <div class="battle-heading">
      <span class="panel-eyebrow">军团模式 · 第 ${level.id} 关</span>
      <h1>军团远征 · ${level.name}</h1>
      <p>${level.briefing}</p>
    </div>
    <div class="battle-header__tools">
      <nav class="mode-switch" aria-label="玩法模式">
        <a href="?level=1">经典</a>
        <a class="active" href="?mode=legion&level=${level.id}">军团</a>
      </nav>
      <div class="terrain-strip" title="${terrain.description}">
        <span><b>产兵</b> ×${terrain.production}</span>
        <span><b>野战</b> ×${terrain.combat}</span>
        <span><b>行军</b> ×${level.speed}</span>
      </div>
    </div>
  `;

  document.querySelector<HTMLElement>("#mission-content")!.innerHTML = `
    <section class="panel-card objective-panel" id="objective-panel" data-state="${initialObjective.state}">
      <span class="panel-eyebrow">当前任务</span>
      <strong id="objective-title">${initialObjective.title}</strong>
      <p id="objective-detail">${initialObjective.detail}</p>
      <div class="objective-track" id="objective-track" role="progressbar" aria-label="任务进度" aria-valuemin="0" aria-valuemax="100">
        <i id="objective-fill" style="width: ${Math.round(initialObjective.progress * 100)}%"></i>
      </div>
    </section>
    <section class="panel-card">
      <span class="panel-eyebrow">我方军团</span>
      <div class="army-summary" id="player-army-summary">${armyMarkup(simulation.forceSummary("player"))}</div>
    </section>
    <section class="sidebar-block">
      <h2>兵种克制</h2>
      <div class="unit-roster">
        ${unitOrder
          .map(
            (unit) => `
              <article class="unit-card ${unitClass(unit)}">
                <b>${unitProfiles[unit].name}</b>
                <span>${unitProfiles[unit].advantage}</span>
                <small>产兵 ${unitProfiles[unit].production}/秒 · 速度 ×${unitProfiles[unit].speed}</small>
              </article>`,
          )
          .join("")}
      </div>
    </section>
    <section class="result-panel" id="result-panel" hidden>
      <div class="result-heading">
        <strong id="result-title"></strong>
      </div>
      <div class="result-stats" id="result-stats"></div>
    </section>
    <details class="panel-section" open>
      <summary>军团模式规则</summary>
      <ul class="intel-list">
        <li><b>自动拆队</b><span>混编堡垒一次出兵会拆成独立步兵、弓兵和骑兵队</span></li>
        <li><b>地面命令</b><span>堡垒可拖向任意地面驻防，野外编队也可再次拖拽改道</span></li>
        <li><b>克制链</b><span>步兵克骑兵，骑兵克弓兵，弓兵克步兵</span></li>
        <li><b>战术行为</b><span>步兵结盾、弓兵远射、骑兵长途移动后冲锋</span></li>
      </ul>
    </details>
  `;

  document.querySelector<HTMLElement>("#command-deck")!.classList.add("command-deck--legion");
  document.querySelector<HTMLElement>("#command-deck")!.innerHTML = `
    <div class="command-group command-group--dispatch">
      <div class="command-group__title">军团调度 <small>可拖向堡垒或任意地面</small></div>
      <div class="command-group__controls">
        <span class="ratio-label">出兵 <b id="ratio-value">50%</b></span>
        ${DISPATCH_PRESETS.map(
          (preset, index) =>
            `<button class="ratio" data-ratio="${preset}" title="快捷键 ${index + 1}">${preset * 100}%</button>`,
        ).join("")}
      </div>
    </div>
    <div class="command-group command-group--legion-info">
      <div class="command-group__title">克制链 <small>选择有利军团出击</small></div>
      <div class="counter-chain">
        <span class="unit-infantry">步兵</span><b>克</b>
        <span class="unit-cavalry">骑兵</span><b>克</b>
        <span class="unit-archer">弓兵</span><b>克</b>
        <span class="unit-infantry">步兵</span>
      </div>
    </div>
    <div class="command-group command-group--tempo">
      <div class="command-group__title">战局节奏 <small>空格暂停</small></div>
      <div class="command-group__controls">
        <button id="pause" title="快捷键 空格">暂停</button>
        <button class="speed active" data-speed="1">1×</button>
        <button class="speed" data-speed="2">2×</button>
      </div>
    </div>
  `;

  document.querySelector<HTMLElement>("#campaign-content")!.innerHTML = `
    <section class="panel-card enemy-card">
      <span class="panel-eyebrow">敌军战术</span>
      <strong>克制型指挥官</strong>
      <p>敌军会比较双方兵种构成，优先进攻具有克制优势的目标。</p>
      <div class="army-summary army-summary--enemy" id="enemy-army-summary">${armyMarkup(simulation.forceSummary("ai"))}</div>
    </section>
    <details class="panel-section campaign-section" open>
      <summary>军团战役</summary>
      <div class="level-grid">
        ${legionLevels
          .map(
            (item) =>
              `<button class="level ${item.id === level.id ? "active" : ""}" data-level="${item.id}" ${item.id > unlocked ? "disabled" : ""}>${item.id}. ${item.name}</button>`,
          )
          .join("")}
      </div>
    </details>
    <details class="panel-section" open>
      <summary>军营专精</summary>
      <ul class="intel-list">
        <li><b>步兵营</b><span>持续补充步兵</span></li>
        <li><b>射手塔</b><span>持续补充弓兵</span></li>
        <li><b>骑兵堡</b><span>持续补充骑兵</span></li>
      </ul>
    </details>
    <div class="campaign-actions">
      <button id="next-level" ${level.id >= unlocked || level.id === legionLevels.length ? "disabled" : ""}>下一关</button>
      <button id="restart">重启战局</button>
    </div>
  `;

  const objectivePanel = document.querySelector<HTMLElement>("#objective-panel")!;
  const objectiveTitle = document.querySelector<HTMLElement>("#objective-title")!;
  const objectiveDetail = document.querySelector<HTMLElement>("#objective-detail")!;
  const objectiveTrack = document.querySelector<HTMLElement>("#objective-track")!;
  const objectiveFill = document.querySelector<HTMLElement>("#objective-fill")!;
  const playerArmySummary = document.querySelector<HTMLElement>("#player-army-summary")!;
  const enemyArmySummary = document.querySelector<HTMLElement>("#enemy-army-summary")!;
  const resultPanel = document.querySelector<HTMLElement>("#result-panel")!;
  const resultTitle = document.querySelector<HTMLElement>("#result-title")!;
  const resultStats = document.querySelector<HTMLElement>("#result-stats")!;

  let lastPlayerArmy = "";
  let lastEnemyArmy = "";
  const refreshHud = () => {
    const objective = simulation.objectiveView;
    const percent = Math.round(objective.progress * 100);
    objectiveTitle.textContent = objective.title;
    objectiveDetail.textContent = objective.detail;
    objectiveFill.style.width = `${percent}%`;
    objectiveTrack.setAttribute("aria-valuenow", String(percent));
    objectivePanel.dataset.state = objective.state;
    const playerMarkup = armyMarkup(simulation.forceSummary("player"));
    const enemyMarkup = armyMarkup(simulation.forceSummary("ai"));
    if (playerMarkup !== lastPlayerArmy) {
      playerArmySummary.innerHTML = playerMarkup;
      lastPlayerArmy = playerMarkup;
    }
    if (enemyMarkup !== lastEnemyArmy) {
      enemyArmySummary.innerHTML = enemyMarkup;
      lastEnemyArmy = enemyMarkup;
    }
  };

  const refreshLevelButtons = () => {
    const currentUnlocked = readUnlocked();
    document.querySelectorAll<HTMLButtonElement>(".level").forEach((button) => {
      button.disabled = Number(button.dataset.level) > currentUnlocked;
    });
    const next = document.querySelector<HTMLButtonElement>("#next-level");
    if (next) {
      next.disabled = level.id >= currentUnlocked || level.id === legionLevels.length;
    }
  };

  const { closeDrawers } = setupShellPanels();
  document.querySelectorAll<HTMLButtonElement>(".level").forEach((button) => {
    button.addEventListener("click", () => {
      location.href = `?mode=legion&level=${button.dataset.level}`;
    });
  });
  document.querySelector("#next-level")!.addEventListener("click", () => {
    location.href = `?mode=legion&level=${level.id + 1}`;
  });
  document.querySelector("#restart")!.addEventListener("click", () => location.reload());

  const pauseButton = document.querySelector<HTMLButtonElement>("#pause")!;
  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>(".speed")];
  pauseButton.addEventListener("click", () => {
    const paused = simulation.togglePaused();
    pauseButton.textContent = paused ? "继续" : "暂停";
    pauseButton.classList.toggle("active", paused);
    renderer.setStatus(paused ? "军团战局已暂停。" : "军团继续推进。");
  });
  speedButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const speed = Number(button.dataset.speed) === 2 ? 2 : 1;
      simulation.setSpeed(speed);
      speedButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderer.setStatus(`战斗速度已切换至 ${speed}×。`);
    });
  });

  const ratioValue = document.querySelector<HTMLElement>("#ratio-value")!;
  const ratioButtons = [...document.querySelectorAll<HTMLButtonElement>(".ratio")];
  const applyDispatchRatio = (ratio: number, announce = true) => {
    const applied = simulation.setDispatchRatio(ratio);
    ratioValue.textContent = `${Math.round(applied * 100)}%`;
    ratioButtons.forEach((button) =>
      button.classList.toggle("active", Math.abs(Number(button.dataset.ratio) - applied) < 0.001),
    );
    if (announce) {
      renderer.setStatus(`军团出兵比例已设为 ${Math.round(applied * 100)}%。`);
    }
  };
  ratioButtons.forEach((button) => {
    button.addEventListener("click", () => applyDispatchRatio(Number(button.dataset.ratio)));
  });
  applyDispatchRatio(simulation.dispatchRatio, false);

  const input = new LegionInputController(app, simulation, {
    setStatus: (message) => renderer.setStatus(message),
    onDispatchRatioChange: (ratio) => applyDispatchRatio(ratio),
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const preset = DISPATCH_PRESETS[Number(event.key) - 1];
    if (preset) {
      event.preventDefault();
      applyDispatchRatio(preset);
    } else if (event.key === "Escape") {
      closeDrawers();
    } else if (event.code === "Space") {
      event.preventDefault();
      pauseButton.click();
    }
  });

  const paintFrame = () =>
    renderer.render({
      forts: simulation.renderForts,
      squads: simulation.renderSquads,
      selection: input.selection,
      dispatchRatio: simulation.dispatchRatio,
      shielded: [],
      playerPace: simulation.playerPace,
      objective: simulation.objectiveView,
      fieldSelection: input.fieldSelection,
      projectiles: simulation.projectiles,
    });

  refreshHud();
  paintFrame();
  app.ticker.add((ticker) => {
    const result = simulation.update(ticker.deltaMS / 1000);
    if (result === "player") {
      unlockAfterVictory(level.id);
      refreshLevelButtons();
      resultTitle.textContent = `${level.name} · 军团胜利`;
      resultStats.textContent = `用时 ${Math.ceil(simulation.elapsed)} 秒 · 剩余兵力 ${Math.floor(armyTotal(simulation.forceSummary("player")))} 人`;
      resultPanel.hidden = false;
      renderer.setStatus(
        `${simulation.endReason} 第 ${Math.min(legionLevels.length, level.id + 1)} 关已解锁。`,
      );
    } else if (result === "ai") {
      resultTitle.textContent = `${level.name} · 军团败北`;
      resultStats.textContent = `${simulation.endReason} 调整兵种克制后再战。`;
      resultPanel.hidden = false;
      renderer.setStatus(simulation.endReason);
    }
    if (result) {
      pauseButton.disabled = true;
      ratioButtons.forEach((button) => (button.disabled = true));
      speedButtons.forEach((button) => (button.disabled = true));
    }
    refreshHud();
    paintFrame();
  });
};
