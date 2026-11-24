import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", selector: "h1" },
  { path: "/demo/", selector: "#start" },
  { path: "/demo/color-test.html", selector: "#run" },
] as const;

for (const entry of pages) {
  test(`${entry.path} loads`, async ({ page }) => {
    const response = await page.goto(entry.path);
    expect(response?.ok()).toBe(true);
    await expect(page.locator(entry.selector)).toBeVisible();
  });
}
