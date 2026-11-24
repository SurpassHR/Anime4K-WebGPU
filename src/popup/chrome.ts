import type { ContentRequest, ContentResponse, PageState } from "../extension/protocol";

export interface TargetFrame {
  tabId: number;
  frameId: number;
}

export interface FrameState extends TargetFrame {
  state: PageState;
}

interface FrameDetails {
  frameId: number;
  parentFrameId: number;
}

const activeTab = (): Promise<chrome.tabs.Tab> => {
  // Lets the Playwright extension test open popup.html directly and target a tab.
  const debugTabId = Number(new URLSearchParams(location.search).get("tabId"));
  if (Number.isInteger(debugTabId) && debugTabId > 0) {
    return Promise.resolve({ id: debugTabId } as chrome.tabs.Tab);
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        reject(new Error("没有可用的活动标签页。"));
        return;
      }
      resolve(tab);
    });
  });
};

const getAllFrames = (tabId: number): Promise<FrameDetails[]> =>
  new Promise((resolve, reject) => {
    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(
        (frames ?? []).map((frame) => ({
          frameId: frame.frameId,
          parentFrameId: frame.parentFrameId,
        })),
      );
    });
  });

const sendToFrame = (
  tabId: number,
  frameId: number,
  request: ContentRequest,
): Promise<ContentResponse | undefined> =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, request, { frameId }, (response: ContentResponse | undefined) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }
      resolve(response);
    });
  });

const displayArea = (state: PageState): number =>
  state.video ? state.video.displayWidth * state.video.displayHeight : 0;

export const discoverPageState = async (): Promise<FrameState> => {
  const tab = await activeTab();
  if (!tab.id) throw new Error("没有可用的活动标签页。");
  const frames = await getAllFrames(tab.id);
  const results = await Promise.all(
    frames.map(async (frame): Promise<FrameState | null> => {
      const response = await sendToFrame(tab.id!, frame.frameId, {
        type: "anime4k:get-state",
      });
      return response
        ? { tabId: tab.id!, frameId: frame.frameId, state: response.state }
        : null;
    }),
  );

  const available = results.filter((result): result is FrameState => result !== null);
  const active = available.find((result) => result.state.enabled);
  const withVideo = available
    .filter((result) => result.state.video)
    .sort((left, right) => displayArea(right.state) - displayArea(left.state));
  const topFrame = available.find((result) => result.frameId === 0);
  const chosen = active ?? withVideo[0] ?? topFrame ?? available[0];

  if (!chosen) {
    throw new Error("当前页面未注入 Anime4K 扩展。请刷新页面后重试。");
  }
  return chosen;
};

export const sendContentRequest = async (
  request: ContentRequest,
  target?: TargetFrame,
): Promise<FrameState> => {
  const initial = target ?? (await discoverPageState());
  const response = await sendToFrame(initial.tabId, initial.frameId, request);
  if (response) {
    return { ...initial, state: response.state };
  }

  const fresh = await discoverPageState();
  const retry = await sendToFrame(fresh.tabId, fresh.frameId, request);
  if (!retry) {
    throw new Error("无法连接到当前页面。请刷新页面后重试。");
  }
  return { ...fresh, state: retry.state };
};
