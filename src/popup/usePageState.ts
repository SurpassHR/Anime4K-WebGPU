import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Anime4KOutput,
  Anime4KQuality,
} from "../core/types";
import type { ContentRequest, PageState } from "../extension/protocol";
import {
  discoverPageState,
  sendContentRequest,
  type FrameState,
  type TargetFrame,
} from "./chrome";

export const usePageState = () => {
  const [state, setState] = useState<PageState | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const targetRef = useRef<TargetFrame | null>(null);

  const applyFrame = useCallback((frame: FrameState): void => {
    targetRef.current = { tabId: frame.tabId, frameId: frame.frameId };
    setState(frame.state);
    setConnectionError(null);
  }, []);

  const discover = useCallback(async (): Promise<void> => {
    try {
      applyFrame(await discoverPageState());
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    }
  }, [applyFrame]);

  const request = useCallback(
    async (message: ContentRequest, markBusy = false): Promise<void> => {
      if (busyRef.current) return;
      if (markBusy) {
        busyRef.current = true;
        setBusy(true);
      }
      try {
        const frame = await sendContentRequest(message, targetRef.current ?? undefined);
        applyFrame(frame);
        if (!frame.state.enabled && !frame.state.video) {
          // The selected frame may have lost its video (or the page replaced it).
          await discover();
        }
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : String(error));
      } finally {
        if (markBusy) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [applyFrame, discover],
  );

  useEffect(() => {
    void request({ type: "anime4k:get-state" });
    const timer = window.setInterval(() => {
      void request({ type: "anime4k:get-state" });
    }, 800);
    return () => window.clearInterval(timer);
  }, [request]);

  const refresh = useCallback(() => request({ type: "anime4k:get-state" }), [request]);
  const rescan = useCallback(() => request({ type: "anime4k:rescan" }, true), [request]);
  const setEnabled = useCallback(
    (enabled: boolean) => request({ type: "anime4k:set-enabled", enabled }, true),
    [request],
  );
  const setOutput = useCallback(
    (output: Anime4KOutput) =>
      request({ type: "anime4k:update-settings", settings: { output } }, false),
    [request],
  );
  const setClampHighlights = useCallback(
    (clampHighlights: boolean) =>
      request({ type: "anime4k:update-settings", settings: { clampHighlights } }, false),
    [request],
  );
  const setQuality = useCallback(
    (quality: Anime4KQuality) =>
      request({ type: "anime4k:update-settings", settings: { quality } }, false),
    [request],
  );

  return {
    state,
    error: connectionError ?? state?.error ?? null,
    connectionError,
    busy,
    refresh,
    rescan,
    setEnabled,
    setOutput,
    setClampHighlights,
    setQuality,
  };
};
