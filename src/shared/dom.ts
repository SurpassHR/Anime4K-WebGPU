export const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

export const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

export const waitForMediaEvent = (
  media: HTMLMediaElement,
  type: "loadeddata" | "seeked",
): Promise<void> => {
  if (type === "loadeddata" && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error("video error"));
    };
    const cleanup = (): void => {
      media.removeEventListener(type, onEvent);
      media.removeEventListener("error", onError);
    };
    media.addEventListener(type, onEvent, { once: true });
    media.addEventListener("error", onError, { once: true });
  });
};

export const seekTo = async (video: HTMLVideoElement, time: number): Promise<void> => {
  if (Math.abs(video.currentTime - time) < 0.001 && !video.seeking) {
    const duration = Number.isFinite(video.duration) ? video.duration : time + 0.001;
    video.currentTime = Math.min(time + 0.001, duration);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    return;
  }
  const seeked = waitForMediaEvent(video, "seeked");
  video.currentTime = time;
  await seeked;
};
