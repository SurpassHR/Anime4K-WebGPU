import type {
  Anime4KOutput,
  Anime4KQuality,
  Anime4KStats,
} from "../core/types";

export const SETTINGS_STORAGE_KEY = "anime4k-webgpu-settings";

export interface PersistedSettings {
  output: Anime4KOutput;
  quality: Anime4KQuality;
  clampHighlights: boolean;
}

export interface ExtensionSettings extends PersistedSettings {
  enabled: boolean;
}

export const DEFAULT_SETTINGS: PersistedSettings = {
  output: "auto",
  quality: "simple",
  clampHighlights: false,
};

export interface VideoSummary {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  ready: boolean;
}

export interface PageState {
  supported: boolean;
  enabled: boolean;
  video: VideoSummary | null;
  videoCount: number;
  settings: ExtensionSettings;
  stats: Anime4KStats | null;
  error: string | null;
}

export type ContentRequest =
  | { type: "anime4k:get-state" }
  | { type: "anime4k:set-enabled"; enabled: boolean }
  | { type: "anime4k:update-settings"; settings: Partial<PersistedSettings> }
  | { type: "anime4k:rescan" };

export interface ContentResponse {
  state: PageState;
}

export const isContentRequest = (value: unknown): value is ContentRequest => {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "anime4k:get-state" ||
    type === "anime4k:set-enabled" ||
    type === "anime4k:update-settings" ||
    type === "anime4k:rescan"
  );
};
