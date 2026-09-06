import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export type DevViewportPreset = "mobile" | "tablet" | "desktop";

export const DEV_VIEWPORT_ORDER: DevViewportPreset[] = [
  "mobile",
  "tablet",
  "desktop",
];

export const DEV_VIEWPORT_PRESETS: Record<
  DevViewportPreset,
  { label: string; width: number | null; height: number | null }
> = {
  mobile: { label: "Mobiel", width: 390, height: 844 },
  tablet: { label: "Tablet", width: 768, height: 1024 },
  desktop: { label: "Desktop", width: null, height: null },
};

const STORAGE_KEY = "tenant-debug-viewport";

export function isDevViewportPreviewFrame(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
}

function readPreset(): DevViewportPreset {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "mobile" || stored === "tablet" || stored === "desktop") {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "desktop";
}

function persistPreset(preset: DevViewportPreset): void {
  try {
    localStorage.setItem(STORAGE_KEY, preset);
  } catch {
    /* ignore */
  }
}

interface DevViewportContextValue {
  preset: DevViewportPreset;
  setPreset: (preset: DevViewportPreset) => void;
  isPreviewFrame: boolean;
}

const DevViewportContext = createContext<DevViewportContextValue | null>(null);

export function DevViewportProvider({ children }: { children: React.ReactNode }) {
  const isPreviewFrame = isDevViewportPreviewFrame();
  const [preset, setPresetState] = useState<DevViewportPreset>(() =>
    isPreviewFrame ? "desktop" : readPreset(),
  );

  const setPreset = useCallback(
    (next: DevViewportPreset) => {
      if (isPreviewFrame) return;
      persistPreset(next);
      setPresetState(next);
    },
    [isPreviewFrame],
  );

  useEffect(() => {
    if (isPreviewFrame) return;
    const framed = preset !== "desktop";
    document.documentElement.classList.toggle("dev-viewport-framed", framed);
    return () => {
      document.documentElement.classList.remove("dev-viewport-framed");
    };
  }, [isPreviewFrame, preset]);

  const value = useMemo(
    () => ({ preset, setPreset, isPreviewFrame }),
    [preset, setPreset, isPreviewFrame],
  );

  return (
    <DevViewportContext.Provider value={value}>{children}</DevViewportContext.Provider>
  );
}

export function useDevViewport(): DevViewportContextValue {
  const ctx = useContext(DevViewportContext);
  if (!ctx) {
    return {
      preset: "desktop",
      setPreset: () => undefined,
      isPreviewFrame: isDevViewportPreviewFrame(),
    };
  }
  return ctx;
}

function DevViewportIframe({ preset }: { preset: Exclude<DevViewportPreset, "desktop"> }) {
  const location = useLocation();
  const { user } = useAuth();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const { width, height, label } = DEV_VIEWPORT_PRESETS[preset];
  const frameW = width ?? 390;
  const frameH = height ?? 844;
  const src = `${location.pathname}${location.search}${location.hash}`;
  const frameKey = `${user?.id ?? "guest"}-${user?.role ?? "public"}-${src}`;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setStageSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const captionSpace = 28;
  const pad = 16;
  const scale =
    stageSize.w > 0 && stageSize.h > 0
      ? Math.min(
          1,
          (stageSize.w - pad * 2) / frameW,
          (stageSize.h - pad * 2 - captionSpace) / frameH,
        )
      : 1;

  return (
    <div
      ref={stageRef}
      className="dev-viewport-stage fixed left-0 right-0 top-0 z-[1100] flex items-center justify-center bg-neutral-900"
      aria-label={`Voorbeeld ${label}`}
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative"
          style={{ width: frameW * scale, height: frameH * scale }}
        >
          <iframe
            key={frameKey}
            title={`Voorbeeld ${label} (${frameW}×${frameH})`}
            src={src}
            className={cn(
              "absolute left-0 top-0 origin-top-left border-0 bg-background shadow-2xl",
              preset === "mobile" && "rounded-[1.75rem]",
              preset === "tablet" && "rounded-xl",
            )}
            style={{
              width: frameW,
              height: frameH,
              transform: `scale(${scale})`,
            }}
          />
        </div>
        <p className="text-[11px] font-medium text-neutral-300">
          {label} · {frameW}×{frameH}
          {scale < 0.995 ? ` · ${Math.round(scale * 100)}%` : null}
        </p>
      </div>
    </div>
  );
}

export function DevViewportGate({ children }: { children: React.ReactNode }) {
  const { preset, isPreviewFrame } = useDevViewport();
  if (isPreviewFrame || preset === "desktop") {
    return <>{children}</>;
  }
  return <DevViewportIframe preset={preset} />;
}
