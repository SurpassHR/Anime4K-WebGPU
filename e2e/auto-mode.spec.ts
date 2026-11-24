import { expect, test, type Page } from "@playwright/test";

const readResult = (page: Page): Promise<string> =>
  page.evaluate(() => document.body.dataset.result ?? "");

test("auto mode switches between restore and 2x", async ({ page }) => {
  await page.goto("/test/auto-mode.html");
  expect(await page.evaluate(() => Boolean(navigator.gpu))).toBe(true);

  await expect
    .poll(() => readResult(page), { timeout: 30_000 })
    .toContain("CLAMP mode=");

  const result = await readResult(page);
  expect(result).not.toContain("ERR");
  expect(result).toContain("AUTO=restore scale=1 canvas=1280x720");
  expect(result).toContain("2X=upscale scale=2 canvas=2560x1440");
  expect(result).toContain("CLAMP mode=upscale canvas=2560x1440");
  expect(result).toContain("CONFIG output=4x quality=balanced");
});
