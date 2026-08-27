import { expect, test } from "@playwright/test";

test("游戏能够加载、控制速度并执行派兵", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/前线/);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#mission-panel")).toBeVisible();
  await expect(page.locator("#campaign-panel")).toBeVisible();
  await expect(page.getByText("胜利目标：消灭全部敌方堡垒与在途部队")).toBeVisible();
  await expect(page.getByText("猛攻型")).toBeVisible();
  await expect(page.getByText("90 秒内获胜")).toBeVisible();
  await expect(page.getByRole("button", { name: /1\. 边境草原 ☆☆☆/ })).toBeVisible();

  const pause = page.getByRole("button", { name: "暂停" });
  await pause.click();
  await expect(page.getByRole("button", { name: "继续" })).toBeVisible();
  await page.getByRole("button", { name: "继续" }).click();

  const doubleSpeed = page.getByRole("button", { name: "2×" });
  await doubleSpeed.click();
  await expect(doubleSpeed).toHaveClass(/active/);

  const collapseMission = page.getByRole("button", { name: "折叠作战简报" });
  await collapseMission.click();
  await expect(page.locator("#game-shell")).toHaveClass(/left-collapsed/);
  await collapseMission.click();
  await expect(page.locator("#game-shell")).not.toHaveClass(/left-collapsed/);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const point = (x: number, y: number) => ({
      x: box.x + (x * box.width) / 1100,
      y: box.y + (y * box.height) / 620,
    });
    const source = point(150, 165);
    const target = point(510, 155);
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
  }

  await page.waitForTimeout(200);
  expect(pageErrors).toEqual([]);
});

test("选关按钮会显示本地保存的最佳星级", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "fortress-records-v1",
      JSON.stringify({
        1: { stars: 2, bestTime: 75, bestCasualties: 18, victories: 1 },
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /1\. 边境草原 ★★☆/ })).toBeVisible();
});

test("窄屏会把两侧信息变为可关闭抽屉", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto("/");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const missionToggle = page.getByRole("button", { name: "任务" });
  await expect(missionToggle).toBeVisible();
  await missionToggle.click();
  await expect(page.locator("#mission-panel")).toHaveClass(/drawer-open/);
  await expect(page.locator("#layout-backdrop")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#mission-panel")).not.toHaveClass(/drawer-open/);
  await expect(page.locator("#layout-backdrop")).toBeHidden();
});

test("军团模式会加载三兵种并保持拖拽派兵操作", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/?mode=legion");

  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: /军团远征 · 三军初阵/ })).toBeVisible();
  await expect(page.getByText("步兵克骑兵，骑兵克弓兵，弓兵克步兵")).toBeVisible();
  await expect(page.getByText(/混编堡垒一次出兵会拆成独立步兵/)).toBeVisible();
  await expect(page.getByText("可拖向堡垒或任意地面")).toBeVisible();
  await expect(page.getByRole("link", { name: "军团" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "1. 三军初阵" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2. 河谷混编" })).toBeDisabled();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const point = (x: number, y: number) => ({
      x: box.x + (x * box.width) / 1100,
      y: box.y + (y * box.height) / 620,
    });
    const source = point(135, 160);
    const target = point(230, 205);
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
  }

  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
});
