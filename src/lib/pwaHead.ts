const KUURNE_PWA = {
  manifestHref: "/kuurne.webmanifest",
  appleTouchIcon: "/images/icons/kuurne/apple-touch-icon.png",
  faviconIco: "/images/icons/kuurne/favicon.ico",
  favicon32: "/images/icons/kuurne/favicon-32x32.png",
  favicon16: "/images/icons/kuurne/favicon-16x16.png",
  icon192: "/images/icons/kuurne/android-chrome-192x192.png",
  icon512: "/images/icons/kuurne/android-chrome-512x512.png",
  appTitle: "MVV Kuurne",
  themeColor: "#1A1A1A",
} as const;

function setMetaName(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLinkRel(rel: string, href: string, extra?: { type?: string; sizes?: string }) {
  const selector = extra?.sizes
    ? `link[rel="${rel}"][sizes="${extra.sizes}"]`
    : extra?.type
      ? `link[rel="${rel}"][type="${extra.type}"]`
      : `link[rel="${rel}"]`;
  const matches = Array.from(document.querySelectorAll<HTMLLinkElement>(selector));
  const el = matches[0] ?? document.createElement("link");
  el.rel = rel;
  el.href = href;
  if (extra?.type) el.type = extra.type;
  if (extra?.sizes) el.sizes = extra.sizes;
  if (!el.parentNode) document.head.appendChild(el);
  matches.slice(1).forEach((dup) => dup.setAttribute("href", href));
}

/** PWA/favicon/app-icon voor de actieve tenant. Call zo vroeg mogelijk. */
export function applyTenantPwaHead(slug: string): void {
  if (typeof document === "undefined") return;
  if (slug !== "kuurne") return;

  setMetaName("theme-color", KUURNE_PWA.themeColor);
  setMetaName("msapplication-TileColor", KUURNE_PWA.themeColor);
  setMetaName("apple-mobile-web-app-title", KUURNE_PWA.appTitle);
  setMetaName("apple-mobile-web-app-status-bar-style", "black");

  setLinkRel("manifest", KUURNE_PWA.manifestHref);
  setLinkRel("apple-touch-icon", KUURNE_PWA.appleTouchIcon);
  setLinkRel("apple-touch-icon", KUURNE_PWA.appleTouchIcon, { sizes: "180x180" });
  setLinkRel("icon", KUURNE_PWA.faviconIco, { sizes: "48x48" });
  setLinkRel("icon", KUURNE_PWA.favicon32, { type: "image/png", sizes: "32x32" });
  setLinkRel("icon", KUURNE_PWA.favicon16, { type: "image/png", sizes: "16x16" });
  setLinkRel("icon", KUURNE_PWA.icon192, { type: "image/png", sizes: "192x192" });
}
