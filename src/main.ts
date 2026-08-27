import { Application } from "pixi.js";
import { abilityOrder, abilityProfiles, type AbilityId } from "./game/abilities";
import { aiPersonalities } from "./game/ai";
import {
  readCampaignRecords,
  readUnlocked,
  recordVictory,
  unlockAfterVictory,
  type CampaignRecords,
} from "./game/campaign";
import { InputController } from "./game/input";
import { getLevel, levels } from "./game/levels";
import { DISPATCH_PRESETS } from "./game/logic";
import { GameRenderer, GAME_HEIGHT, GAME_WIDTH } from "./game/renderer";
import { evaluateBattle, type BattleRating, type ChallengeEvaluation } from "./game/scoring";
import { GameSimulation } from "./game/simulation";
import { terrainEffects } from "./game/terrain";
import { setupShellPanels } from "./layout-controller";
import "./style.css";
import "./layout.css";

const requestedMode = new URLSearchParams(location.search).get("mode");
if (requestedMode === "legion") {
  const { mountLegionGame } = await import("./game/legion-app");
  await mountLegionGame();
} else {
  const selectedLevel = Number(new URLSearchParams(location.search).get("level") || "1");
  const level = getLevel(selectedLevel);
  const simulation = new GameSimulation(level);

  const app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    antialias: true,
    background: "#d8c69b",
    resolution: Math.min(devicePixelRatio, 2),
  });
  document.querySelector<HTMLDivElement>("#app")!.append(app.canvas);

  const renderer = new GameRenderer(app, level, simulation.forts);

  const ABILITY_KEYS = ["q", "w", "e", "r"];
  const unlocked = readUnlocked(localStorage, levels.length);
  const records = readCampaignRecords(localStorage, levels.length);
  const terrain = terrainEffects[level.biome];
  const enemyStrategy = aiPersonalities[level.aiPersonality];
  const initialObjective = simulation.objectiveView;
  const enemyAbilityName = level.aiAbility ? abilityProfiles[level.aiAbility].name : "无";
  const initialRating = evaluateBattle(level.challenges, simulation.stats, false, false);

  const starsText = (stars: number) => `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
  const levelLabel = (id: number, name: string, campaign: CampaignRecords) =>
    `${id}. ${name} ${starsText(campaign[id]?.stars ?? 0)}`;
  const challengeMarkup = (challenges: readonly ChallengeEvaluation[]) =>
    challenges
      .map((challenge) => {
        const icon = challenge.state === "met" ? "★" : challenge.state === "failed" ? "×" : "☆";
        return `<span class="challenge" data-state="${challenge.state}"><b>${icon}</b>${challenge.label}<small>${challenge.progress}</small></span>`;
      })
      .join("");
  const formatTime = (seconds: number) => {
    const rounded = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  };
  const recordSummaryText = (campaign: CampaignRecords) => {
    const record = campaign[level.id];
    return record
      ? `<strong>${starsText(record.stars)}</strong><span>最快 ${formatTime(record.bestTime ?? 0)}</span><span>最少伤亡 ${Math.round(record.bestCasualties ?? 0)} 人</span><span>胜利 ${record.victories} 次</span>`
      : "<strong>☆☆☆</strong><span>尚无通关记录</span>";
  };

  document.querySelector<HTMLElement>("#battle-header")!.innerHTML = `
  <div class="battle-heading">
    <span class="panel-eyebrow">第 ${level.id} 关 · 实时堡垒争夺</span>
    <h1>王国争夺 · ${level.name}</h1>
    <p>${level.briefing}</p>
  </div>
  <div class="battle-header__tools">
    <nav class="mode-switch" aria-label="玩法模式">
      <a class="active" href="?level=${level.id}">经典</a>
      <a href="?mode=legion">军团</a>
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
  <section class="sidebar-block">
    <h2>三星挑战</h2>
    <div class="challenge-row" id="challenge-row" aria-label="本关三星挑战">
      ${challengeMarkup(initialRating.challenges)}
    </div>
  </section>
  <section class="result-panel" id="result-panel" hidden>
    <div class="result-heading">
      <strong id="result-title"></strong>
      <span id="result-stars"></span>
    </div>
    <div class="result-stats" id="result-stats"></div>
    <div class="result-challenges" id="result-challenges"></div>
    <small id="result-best"></small>
  </section>
  <details class="panel-section" open>
    <summary>战场规则与图例</summary>
    <ul class="intel-list">
      <li><b>金色驻军</b><span>已达自然产兵上限，应及时出兵</span></li>
      <li><b>蓝色路线</b><span>向己方堡垒快速增援</span></li>
      <li><b>橙色路线</b><span>进攻敌方或中立堡垒</span></li>
      <li><b>地形效果</b><span>${terrain.description}</span></li>
    </ul>
  </details>
`;

  document.querySelector<HTMLElement>("#command-deck")!.innerHTML = `
  <div class="command-group command-group--dispatch">
    <div class="command-group__title">兵力调度 <small>滚轮可按 5% 微调</small></div>
    <div class="command-group__controls">
      <span class="ratio-label">出兵 <b id="ratio-value">50%</b></span>
      ${DISPATCH_PRESETS.map(
        (preset, index) =>
          `<button class="ratio" data-ratio="${preset}" title="快捷键 ${index + 1}">${preset * 100}%</button>`,
      ).join("")}
    </div>
  </div>
  <div class="command-group command-group--abilities">
    <div class="command-group__title">战术技能 <small>Q / W / E / R</small></div>
    <div class="command-group__controls ability-row">
      ${abilityOrder
        .map(
          (id, index) =>
            `<button class="ability" data-ability="${id}" title="${abilityProfiles[id].hint}（快捷键 ${ABILITY_KEYS[index].toUpperCase()}）"><small>${ABILITY_KEYS[index].toUpperCase()}</small>${abilityProfiles[id].name}<b>×${abilityProfiles[id].charges}</b></button>`,
        )
        .join("")}
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
    <span class="panel-eyebrow">敌军指挥官</span>
    <strong>${enemyStrategy.name}</strong>
    <p>${enemyStrategy.hint}</p>
    <span class="enemy-plan" id="enemy-plan" title="${enemyStrategy.hint}">战术：${enemyAbilityName}</span>
  </section>
  <details class="panel-section campaign-section" open>
    <summary>战役地图</summary>
    <div class="level-grid">
      ${levels.map((item) => `<button class="level ${item.id === level.id ? "active" : ""}" data-level="${item.id}" ${item.id > unlocked ? "disabled" : ""}>${levelLabel(item.id, item.name, records)}</button>`).join("")}
    </div>
  </details>
  <details class="panel-section" open>
    <summary>本关记录</summary>
    <div class="record-summary" id="record-summary">${recordSummaryText(records)}</div>
  </details>
  <div class="campaign-actions">
      <button id="next-level" ${level.id >= unlocked || level.id === levels.length ? "disabled" : ""}>下一关</button>
      <button id="restart">重启战局</button>
  </div>
`;

  const objectivePanel = document.querySelector<HTMLElement>("#objective-panel")!;
  const objectiveTitle = document.querySelector<HTMLElement>("#objective-title")!;
  const objectiveDetail = document.querySelector<HTMLElement>("#objective-detail")!;
  const objectiveTrack = document.querySelector<HTMLElement>("#objective-track")!;
  const objectiveFill = document.querySelector<HTMLElement>("#objective-fill")!;
  const enemyPlan = document.querySelector<HTMLElement>("#enemy-plan")!;
  const challengeRow = document.querySelector<HTMLElement>("#challenge-row")!;
  const resultPanel = document.querySelector<HTMLElement>("#result-panel")!;
  const resultTitle = document.querySelector<HTMLElement>("#result-title")!;
  const resultStars = document.querySelector<HTMLElement>("#result-stars")!;
  const resultStats = document.querySelector<HTMLElement>("#result-stats")!;
  const resultChallenges = document.querySelector<HTMLElement>("#result-challenges")!;
  const resultBest = document.querySelector<HTMLElement>("#result-best")!;
  const recordSummary = document.querySelector<HTMLElement>("#record-summary")!;

  const refreshObjectiveHud = () => {
    const view = simulation.objectiveView;
    const percent = Math.round(view.progress * 100);
    objectiveTitle.textContent = view.title;
    objectiveDetail.textContent = view.detail;
    objectiveFill.style.width = `${percent}%`;
    objectiveTrack.setAttribute("aria-valuenow", String(percent));
    objectivePanel.dataset.state = view.state;

    const command = simulation.aiAbility;
    if (!command) {
      enemyPlan.textContent = "本关未装备战术";
      return;
    }
    const state =
      command.state.charges <= 0
        ? "已耗尽"
        : command.state.cooldown > 0
          ? `${Math.ceil(command.state.cooldown)} 秒`
          : "已就绪";
    enemyPlan.textContent = `战术 · ${abilityProfiles[command.id].name} · ${state}`;
  };

  let lastChallengeView = "";
  const refreshChallengeHud = () => {
    const rating = evaluateBattle(
      level.challenges,
      simulation.stats,
      simulation.objective.outcome === "player",
      simulation.ended,
    );
    const markup = challengeMarkup(rating.challenges);
    if (markup !== lastChallengeView) {
      challengeRow.innerHTML = markup;
      lastChallengeView = markup;
    }
  };

  const showBattleResult = (victory: boolean): BattleRating => {
    const rating = evaluateBattle(level.challenges, simulation.stats, victory, true);
    const record = victory
      ? recordVictory(localStorage, level.id, rating, levels.length)
      : readCampaignRecords(localStorage, levels.length)[level.id];

    resultTitle.textContent = victory ? `${level.name} · 任务完成` : `${level.name} · 任务失败`;
    resultStars.textContent = starsText(rating.stars);
    resultStats.textContent = `用时 ${formatTime(rating.stats.elapsed)}　调令 ${rating.stats.orders} 次　派兵 ${rating.stats.soldiersDispatched} 人　伤亡 ${Math.round(rating.stats.casualties)} 人　技能 ${rating.stats.abilitiesUsed} 次　失守 ${rating.stats.fortsLost} 次`;
    resultChallenges.innerHTML = challengeMarkup(rating.challenges);
    resultBest.textContent = record
      ? `历史最佳：${starsText(record.stars)} · 最快 ${formatTime(record.bestTime ?? rating.stats.elapsed)} · 最少伤亡 ${Math.round(record.bestCasualties ?? rating.stats.casualties)} 人 · 已胜利 ${record.victories} 次`
      : "尚无通关记录";
    resultPanel.hidden = false;
    return rating;
  };

  const refreshCampaignButtons = () => {
    const currentUnlocked = readUnlocked(localStorage, levels.length);
    const currentRecords = readCampaignRecords(localStorage, levels.length);
    recordSummary.innerHTML = recordSummaryText(currentRecords);
    document.querySelectorAll<HTMLButtonElement>(".level").forEach((button) => {
      const id = Number(button.dataset.level);
      button.disabled = id > currentUnlocked;
      const item = levels[id - 1];
      if (item) button.textContent = levelLabel(item.id, item.name, currentRecords);
    });
    const next = document.querySelector<HTMLButtonElement>("#next-level");
    if (next) next.disabled = level.id >= currentUnlocked || level.id === levels.length;
  };

  const { closeDrawers } = setupShellPanels();

  document.querySelectorAll<HTMLButtonElement>(".level").forEach((button) => {
    button.addEventListener("click", () => {
      location.href = `?level=${button.dataset.level}`;
    });
  });
  document.querySelector("#next-level")!.addEventListener("click", () => {
    location.href = `?level=${level.id + 1}`;
  });
  document.querySelector("#restart")!.addEventListener("click", () => location.reload());
  const pauseButton = document.querySelector<HTMLButtonElement>("#pause")!;
  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>(".speed")];
  pauseButton.addEventListener("click", () => {
    const paused = simulation.togglePaused();
    pauseButton.textContent = paused ? "继续" : "暂停";
    pauseButton.classList.toggle("active", paused);
    renderer.setStatus(paused ? "战局已暂停，可调整观察后继续。" : "战斗继续。");
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
    const percent = Math.round(applied * 100);
    ratioValue.textContent = `${percent}%`;
    ratioButtons.forEach((button) =>
      button.classList.toggle("active", Math.abs(Number(button.dataset.ratio) - applied) < 0.001),
    );
    if (announce) renderer.setStatus(`出兵比例已设为 ${percent}%（滚轮微调，1-4 键切换档位）。`);
  };
  ratioButtons.forEach((button) => {
    button.addEventListener("click", () => applyDispatchRatio(Number(button.dataset.ratio)));
  });
  applyDispatchRatio(simulation.dispatchRatio, false);

  const abilityButtons = [...document.querySelectorAll<HTMLButtonElement>(".ability")];
  const refreshAbilityBar = () => {
    for (const button of abilityButtons) {
      const id = button.dataset.ability as AbilityId;
      const state = simulation.abilities[id];
      const badge = state.cooldown > 0 ? `${Math.ceil(state.cooldown)}s` : `×${state.charges}`;
      const counter = button.querySelector("b")!;
      if (counter.textContent !== badge) counter.textContent = badge;

      const locked =
        simulation.ended || simulation.paused || state.charges <= 0 || state.cooldown > 0;
      if (button.disabled !== locked) button.disabled = locked;
      button.classList.toggle("armed", input.armed === id);
    }
  };
  abilityButtons.forEach((button) => {
    button.addEventListener("click", () =>
      input.triggerAbility(button.dataset.ability as AbilityId),
    );
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const preset = DISPATCH_PRESETS[Number(event.key) - 1];
    const abilityIndex = ABILITY_KEYS.indexOf(event.key.toLowerCase());

    if (preset) {
      event.preventDefault();
      applyDispatchRatio(preset);
    } else if (abilityIndex >= 0) {
      event.preventDefault();
      input.triggerAbility(abilityOrder[abilityIndex]);
    } else if (event.key === "Escape") {
      closeDrawers();
      input.cancelAiming();
    } else if (event.code === "Space") {
      event.preventDefault();
      pauseButton.click();
    }
  });

  const input = new InputController(app, simulation, {
    setStatus: (message) => renderer.setStatus(message),
    onDispatchRatioChange: (ratio) => applyDispatchRatio(ratio),
    onAbilityStateChange: () => refreshAbilityBar(),
  });

  const paintFrame = () =>
    renderer.render({
      forts: simulation.forts,
      squads: simulation.squads,
      selection: input.selection,
      dispatchRatio: simulation.dispatchRatio,
      shielded: simulation.shieldedForts,
      playerPace: simulation.playerPace,
      objective: simulation.objectiveView,
    });

  refreshAbilityBar();
  refreshObjectiveHud();
  refreshChallengeHud();
  paintFrame();
  app.ticker.add((ticker) => {
    const result = simulation.update(ticker.deltaMS / 1000);
    if (result === "player") {
      unlockAfterVictory(localStorage, level.id, levels.length);
      const rating = showBattleResult(true);
      refreshCampaignButtons();
      renderer.setStatus(
        `${level.name} 胜利：${simulation.endReason} 本局获得 ${rating.stars} 星，第 ${Math.min(levels.length, level.id + 1)} 关已解锁。`,
      );
    } else if (result === "ai") {
      showBattleResult(false);
      renderer.setStatus(`${simulation.endReason} 点击“重启战局”再战。`);
    }
    if (result) {
      pauseButton.disabled = true;
      speedButtons.forEach((button) => (button.disabled = true));
      ratioButtons.forEach((button) => (button.disabled = true));
    }
    refreshAbilityBar();
    refreshObjectiveHud();
    refreshChallengeHud();
    paintFrame();
  });
}
