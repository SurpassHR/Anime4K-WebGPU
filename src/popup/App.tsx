import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Field,
  Loading,
  MetricGrid,
  Page,
  PageHeader,
  Panel,
  PanelHeader,
  Segmented,
  StudioIcon,
  StudioProvider,
} from "@xmsthc/studio-ui";
import type { Anime4KOutput, Anime4KQuality } from "../core/types";
import { usePageState } from "./usePageState";

const labels = {
  loading: "读取中…",
  close: "关闭",
  cancel: "取消",
  confirm: "确认",
  search: "搜索",
  searchPlaceholder: "搜索操作…",
  noResults: "没有匹配项",
  progress: "进度",
  notifications: "通知",
  dismissNotification: "关闭通知",
  switchToDark: "切换深色主题",
  switchToLight: "切换浅色主题",
  compactDensity: "紧凑布局",
  comfortableDensity: "舒适布局",
  openInspector: "打开检查器",
  closeInspector: "关闭检查器",
  pinInspector: "固定检查器",
  unpinInspector: "取消固定检查器",
  navigation: "导航",
  inspector: "检查器",
};

const outputOptions: Array<{ value: Anime4KOutput; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "restore", label: "1×" },
  { value: "2x", label: "2×" },
  { value: "4x", label: "4×" },
  { value: "8x", label: "8×" },
];

const qualityOptions: Array<{ value: Anime4KQuality; label: string }> = [
  { value: "simple", label: "简单" },
  { value: "balanced", label: "均衡" },
  { value: "ultra", label: "极致" },
];

const qualityLabel = (quality: Anime4KQuality): string =>
  quality === "balanced" ? "均衡" : quality === "ultra" ? "极致" : "简单";

const activeModeLabel = (mode: "restore" | "upscale"): string =>
  mode === "restore" ? "1× 修复" : "超分";

const statusBadge = (
  state: ReturnType<typeof usePageState>["state"],
  connectionError: string | null,
) => {
  if (connectionError) return <Badge tone="danger" dot>连接失败</Badge>;
  if (!state) return <Badge>读取中</Badge>;
  if (!state.supported) return <Badge tone="danger" dot>无 WebGPU</Badge>;
  if (state.error) return <Badge tone="danger" dot>{state.enabled ? "运行异常" : "启动失败"}</Badge>;
  if (state.enabled) return <Badge tone="accent" dot>运行中</Badge>;
  if (state.video) return <Badge tone="warn" dot>待启动</Badge>;
  return <Badge tone="warn" dot>未找到视频</Badge>;
};

export const App = () => {
  const {
    state,
    error,
    connectionError,
    busy,
    rescan,
    setEnabled,
    setOutput,
    setClampHighlights,
    setQuality,
  } = usePageState();

  const output = state?.settings.output ?? "auto";
  const quality = state?.settings.quality ?? "simple";
  const clampHighlights = state?.settings.clampHighlights ?? false;
  const enabled = state?.enabled ?? false;
  const video = state?.video ?? null;
  const stats = state?.stats ?? null;

  return (
    <StudioProvider storageKey="anime4k-webgpu-studio" labels={labels}>
      <Page grid={false} className="popup-page">
        <PageHeader
          kicker="WEBGPU"
          title="Anime4K"
          description="视频超分控制"
          actions={statusBadge(state, connectionError)}
        />

        <Panel tone="raised">
          <PanelHeader
            eyebrow="VIDEO"
            title="当前页面"
            actions={
              <Button size="sm" icon="refresh" onClick={() => void rescan()} loading={busy}>
                重新扫描
              </Button>
            }
          />
          <div className="popup-panel-body">
            {!state && !error ? (
              <Loading label="正在读取当前页面…" />
            ) : video ? (
              <MetricGrid
                columns={2}
                items={[
                  {
                    label: "源尺寸",
                    value: video.ready ? `${video.width}×${video.height}` : "等待视频",
                  },
                  {
                    label: "显示尺寸",
                    value: `${video.displayWidth}×${video.displayHeight}`,
                  },
                ]}
              />
            ) : (
              <p className="popup-muted">
                当前标签页没有检测到可超分视频。播放视频后点击「重新扫描」。
              </p>
            )}
            {state && state.videoCount > 1 ? (
              <p className="popup-muted">检测到 {state.videoCount} 个视频，默认使用画面最大者。</p>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader eyebrow="CONTROLS" title="超分设置" />
          <div className="popup-panel-body popup-stack">
            <Field
              label="输出策略"
              asGroup
              hint="自动：显示需要时 2×，否则 1× 修复；2×/4×/8× 为强制超分。"
            >
              <div className="popup-segmented">
                <Segmented
                  value={output}
                  options={outputOptions}
                  onChange={(value) => void setOutput(value)}
                  label="输出策略"
                />
              </div>
            </Field>
            <Field
              label="精细程度"
              asGroup
              hint="均衡/极致会在输出分辨率增加 Restore 细化 pass。"
            >
              <div className="popup-segmented">
                <Segmented
                  value={quality}
                  options={qualityOptions}
                  onChange={(value) => void setQuality(value)}
                  label="精细程度"
                />
              </div>
            </Field>
            <Checkbox
              label="Clamp 高光"
              hint="抑制过曝高光，增加 3 个 pass。"
              checked={clampHighlights}
              onChange={(event) => void setClampHighlights(event.currentTarget.checked)}
            />
            <Divider />
            <Button
              className="popup-full-button"
              variant={enabled ? "danger" : "primary"}
              icon={enabled ? "stop" : "play"}
              loading={busy}
              disabled={!video}
              onClick={() => void setEnabled(!enabled)}
            >
              {enabled ? "停止超分" : "启动超分"}
            </Button>
          </div>
        </Panel>

        {stats ? (
          <Panel tone="sunken">
            <PanelHeader
              eyebrow="LIVE"
              title="运行状态"
              actions={<Badge tone="accent">{activeModeLabel(stats.mode)}</Badge>}
            />
            <div className="popup-panel-body">
              <MetricGrid
                columns={2}
                items={[
                  {
                    label: "输出尺寸",
                    value: `${stats.width * stats.scale}×${stats.height * stats.scale}`,
                  },
                  { label: "帧率", value: `${stats.fps.toFixed(0)} fps` },
                  { label: "实际倍数", value: `${stats.scale}×` },
                  { label: "精细度", value: qualityLabel(stats.quality) },
                  { label: "已渲染", value: stats.frames.toLocaleString() },
                  { label: "格式", value: stats.format },
                ]}
              />
            </div>
          </Panel>
        ) : null}

        {error ? (
          <div className="popup-error" role="alert">
            <StudioIcon name="warning" size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <p className="popup-hint">设置保存在本机；启用只影响当前标签页。</p>
      </Page>
    </StudioProvider>
  );
};
