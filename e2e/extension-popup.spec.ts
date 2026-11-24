import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const extensionPath = fileURLToPath(new URL("../dist/extension", import.meta.url));
const siteUrl = "http://127.0.0.1:8766";

type ExtensionFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  demoPage: Page;
  popupPage: Page;
};

const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({}, use, testInfo) => {
    const context = await chromium.launchPersistentContext(
      testInfo.outputPath("extension-profile"),
      {
        channel: "chromium",
        headless: true,
        viewport: { width: 1280, height: 900 },
        args: [
          "--enable-unsafe-webgpu",
          "--use-angle=metal",
          "--autoplay-policy=no-user-gesture-required",
          "--disable-extensions-except=" + extensionPath,
          "--load-extension=" + extensionPath,
        ],
      },
    );
    await use(context);
    await context.close();
  },

  extensionId: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await page.goto("chrome://extensions-internals/");
    const extensions = JSON.parse(await page.locator("body").innerText()) as Array<{
      id: string;
      name: string;
    }>;
    const extension = extensions.find((item) => item.name === "Anime4K WebGPU");
    await page.close();
    if (!extension) throw new Error("Anime4K WebGPU extension did not load");
    await use(extension.id);
  },

  demoPage: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await page.goto(siteUrl + "/demo/");
    await page.waitForSelector("#v");
    await page.waitForTimeout(1500);
    await use(page);
  },

  popupPage: async ({ extensionContext, extensionId, demoPage }, use) => {
    void demoPage;
    const helper = await extensionContext.newPage();
    await helper.goto(`chrome-extension://${extensionId}/popup.html`);
    const demoTabId = await helper.evaluate(async () => {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({}, resolve);
      });
      const demo = tabs.find((tab) => (tab.url ?? "").includes("127.0.0.1:8766/demo"));
      if (!demo?.id) throw new Error("Demo tab not found");
      return demo.id;
    });
    await helper.close();

    const page = await extensionContext.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/popup.html?tabId=${demoTabId}`,
    );
    await page.waitForSelector(".popup-page");
    await use(page);
  },
});

test("toolbar popup controls the active video without in-player controls", async ({
  demoPage,
  popupPage,
}) => {
  test.setTimeout(60_000);

  const inPlayerControls = await demoPage.evaluate(() => ({
    buttons: document.querySelectorAll("[data-anime4k-webgpu] button").length,
    hud: document.querySelectorAll("[data-anime4k-webgpu] .hud").length,
    toast: document.querySelectorAll("[data-anime4k-webgpu] .toast").length,
    hosts: document.querySelectorAll("[data-anime4k-webgpu]").length,
  }));
  expect(inPlayerControls).toEqual({ buttons: 0, hud: 0, toast: 0, hosts: 1 });

  await expect(popupPage.locator(".popup-page")).toContainText("当前页面");
  await expect(popupPage.locator(".popup-page")).toContainText("1280×720");

  await popupPage.getByRole("button", { name: "4×", exact: true }).click();
  await popupPage.getByRole("button", { name: "均衡" }).click();
  await expect
    .poll(() =>
      popupPage.evaluate(() => chrome.storage.local.get("anime4k-webgpu-settings")),
    )
    .toMatchObject({
      "anime4k-webgpu-settings": {
        output: "4x",
        quality: "balanced",
      },
    });
  await popupPage.getByRole("button", { name: "2×", exact: true }).click();
  await popupPage.getByRole("button", { name: "简单" }).click();
  await popupPage.getByRole("button", { name: "启动超分" }).click();
  await expect(popupPage.locator(".popup-page")).toContainText("运行中");
  await expect(popupPage.locator(".popup-page")).toContainText("运行状态");

  const readPlayer = () =>
    demoPage.evaluate(() => {
      const video = document.getElementById("v");
      const host = document.querySelector("[data-anime4k-webgpu]");
      const canvas = host?.shadowRoot?.querySelector("canvas");
      return {
        opacity: video ? getComputedStyle(video).opacity : null,
        hostDisplay: host ? getComputedStyle(host).display : null,
        canvasVisibility: canvas ? getComputedStyle(canvas).visibility : null,
      };
    });

  await expect.poll(async () => (await readPlayer()).opacity).toBe("0");
  await expect.poll(async () => (await readPlayer()).hostDisplay).toBe("block");
  await expect.poll(async () => (await readPlayer()).canvasVisibility).toBe("visible");

  const stored = await popupPage.evaluate(() =>
    chrome.storage.local.get("anime4k-webgpu-settings"),
  );
  expect(stored["anime4k-webgpu-settings"]).toMatchObject({
    output: "2x",
    quality: "simple",
  });

  await popupPage.getByRole("button", { name: "停止超分" }).click();
  await expect(popupPage.locator(".popup-page")).toContainText("待启动");
  await expect.poll(async () => (await readPlayer()).opacity).toBe("1");
  await expect.poll(async () => (await readPlayer()).hostDisplay).toBe("none");
  await expect.poll(async () => (await readPlayer()).canvasVisibility).toBe("hidden");
});

test("toolbar popup finds a video inside an iframe", async ({
  extensionContext,
  extensionId,
}) => {
  test.setTimeout(60_000);

  const framePage = await extensionContext.newPage();
  await framePage.goto(siteUrl + "/test/frame-parent.html");
  await framePage.waitForTimeout(1500);
  await expect(framePage.frameLocator("iframe").locator("video")).toBeVisible();

  const helper = await extensionContext.newPage();
  await helper.goto(`chrome-extension://${extensionId}/popup.html`);
  const tabId = await helper.evaluate(async () => {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({}, resolve);
    });
    const tab = tabs.find((item) => (item.url ?? "").includes("/test/frame-parent.html"));
    if (!tab?.id) throw new Error("Iframe test tab not found");
    return tab.id;
  });
  await helper.close();

  const popup = await extensionContext.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await popup.waitForSelector(".popup-page");
  await expect(popup.locator(".popup-page")).toContainText("640×360");
  await expect(popup.locator(".popup-page")).toContainText("待启动");

  await popup.getByRole("button", { name: "2×", exact: true }).click();
  await popup.getByRole("button", { name: "启动超分" }).click();
  await expect(popup.locator(".popup-page")).toContainText("运行中");

  const iframe = framePage.frameLocator("iframe");
  const video = iframe.locator("video");
  await expect.poll(() => video.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");

  const host = await iframe.locator("[data-anime4k-webgpu]").elementHandle();
  if (!host) throw new Error("Iframe overlay host not found");
  const overlay = await host.evaluate((element) => {
    const canvas = element.shadowRoot?.querySelector("canvas");
    return {
      hostDisplay: getComputedStyle(element).display,
      canvasVisibility: canvas ? getComputedStyle(canvas).visibility : null,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
    };
  });
  expect(overlay).toEqual({
    hostDisplay: "block",
    canvasVisibility: "visible",
    canvasWidth: 2560,
    canvasHeight: 1440,
  });

  await popup.getByRole("button", { name: "停止超分" }).click();
  await expect(popup.locator(".popup-page")).toContainText("待启动");
  await expect.poll(() => video.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  const stoppedHost = await iframe.locator("[data-anime4k-webgpu]").elementHandle();
  expect(await stoppedHost?.evaluate((element) => getComputedStyle(element).display)).toBe("none");
});
