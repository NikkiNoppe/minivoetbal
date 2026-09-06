import React from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import {
  DEV_VIEWPORT_ORDER,
  DEV_VIEWPORT_PRESETS,
  type DevViewportPreset,
  useDevViewport,
} from "@/context/DevViewportContext";
import { devMiniButtonClass } from "@/components/admin/devToolbarStyles";

const VIEWPORT_ICONS: Record<DevViewportPreset, typeof Monitor> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

export function DevViewportSwitchButtons() {
  const { preset, setPreset, isPreviewFrame } = useDevViewport();

  if (isPreviewFrame) return null;

  return (
    <div
      className="flex flex-nowrap items-center gap-1.5"
      role="group"
      aria-label="Wissel schermformaat (dev)"
    >
      {DEV_VIEWPORT_ORDER.map((id) => {
        const isActive = preset === id;
        const Icon = VIEWPORT_ICONS[id];
        const label = DEV_VIEWPORT_PRESETS[id].label;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setPreset(id)}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            className={devMiniButtonClass(isActive)}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
