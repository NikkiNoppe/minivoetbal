import React from "react";
import { useBranding } from "@/hooks/useBranding";
import { resolveHeaderLogoPath } from "@/types/branding";

interface LogoProps {
  onClick: () => void;
}

const Logo: React.FC<LogoProps> = ({ onClick }) => {
  const branding = useBranding();
  const logoSrc = resolveHeaderLogoPath(branding);

  return (
    <button
      type="button"
      className="flex items-center gap-3 cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
      onClick={onClick}
      aria-label="Ga naar de startpagina"
    >
      <div className="h-14 w-[189px] flex items-center justify-center">
        <img
          src={logoSrc}
          alt={`${branding.displayName} Logo`}

          className="h-14 w-auto object-contain px-2"
          width={189}
          height={56}
          loading="eager"
          decoding="async"
          draggable={false}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = branding.logoIconPath;
          }}
        />
      </div>
    </button>
  );
};

export default Logo;
