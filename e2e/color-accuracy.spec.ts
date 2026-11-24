import { expect, test, type Page } from "@playwright/test";

const readResult = (page: Page): Promise<string> =>
  page.evaluate(() => document.body.dataset.result ?? "");

const cases = [
  { path: "/test/color-2x.html", label: "2x + clamp", maxDelta: 2 },
  { path: "/test/color-restore.html", label: "1x restore", maxDelta: 1 },
] as const;

for (const testCase of cases) {
  test(`${testCase.label} keeps SMPTE color error within tolerance`, async ({ page }) => {
    await page.goto(testCase.path);
    expect(await page.evaluate(() => Boolean(navigator.gpu))).toBe(true);

    await expect
      .poll(() => readResult(page), { timeout: 30_000 })
      .toContain("MAXD=");

    const result = await readResult(page);
    expect(result).not.toContain("ERR");
    const maxDelta = result.match(/MAXD=(\d+)/);
    if (!maxDelta) throw new Error("Missing MAXD in test result: " + result);
    expect(Number(maxDelta[1])).toBeLessThanOrEqual(testCase.maxDelta);
  });
}
