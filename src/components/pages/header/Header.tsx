import React, { useState, useCallback, useMemo } from "react";
import { useOrgAwareNavigate } from "@/hooks/useOrgAwareNavigate";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { User, LogOut, ChevronRight } from "lucide-react";
import HamburgerIcon from "@/components/ui/hamburger-icon";
import Logo from "./Logo";
import { useTabVisibility } from "@/context/TabVisibilityContext";
import { ADMIN_ROUTES, getPathFromTab } from "@/config/routes";
import {
  type NavItem,
  type MobileSheetSection,
  NAV_ROUTE_MAP,
  normalizeRole,
  getRoleLabel,
  getOrderedPublicNavItems,
  getMobileSheetSections,
} from "@/config/navigation";
import { cn } from "@/lib/utils";
import { isTenantDebugPanelEnabled } from "@/components/admin/TenantDebugPanel";

interface HeaderProps {
  onLogoClick: () => void;
  onLoginClick: () => void;
  activeTab: string;
  isAuthenticated?: boolean;
  user?: { id?: number; username?: string; email?: string; role?: string } | null;
  hasSidebar?: boolean;
}

const menuContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const menuItemVariants = {
  hidden: { opacity: 0, x: 12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

const accordionTriggerClass =
  "text-sm font-semibold text-gray-500 uppercase tracking-wider px-2 py-2 min-h-[44px] items-center hover:no-underline";

const superadminAccordionTriggerClass =
  "text-sm font-semibold text-violet-800 uppercase tracking-wider px-2 py-2 min-h-[44px] items-center hover:no-underline bg-violet-50/80 rounded-lg";

const superadminBadgeClass =
  "rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800";

const superadminSectionHeadingClass =
  "text-sm font-semibold text-violet-800 uppercase tracking-wider";

interface NavLinkButtonProps {
  item: NavItem;
  isActive: boolean;
  onNavigate: (key: string) => void;
  variant?: "sheet" | "desktop";
  index?: number;
  animate?: boolean;
}

interface SheetSection extends MobileSheetSection {}

interface DesktopShortcutSection {
  id: string;
  title: string;
  item: NavItem;
}

const NavLinkButton: React.FC<NavLinkButtonProps> = ({
  item,
  isActive,
  onNavigate,
  variant = "sheet",
  index = 0,
  animate = true,
}) => {
  const Icon = item.icon;
  const prefersReducedMotion = useReducedMotion();

  const button = (
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        variant === "sheet" &&
          "btn-nav w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
        variant === "sheet" && isActive && "active",
        variant === "desktop" &&
          "inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-white/90 hover:text-white hover:bg-brand-500/50 transition-colors min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600",
        variant === "desktop" && isActive && "bg-brand-500/60 text-white font-medium"
      )}
    >
      <Icon size={18} className="flex-shrink-0" />
      {item.label}
    </button>
  );

  if (variant === "desktop") {
    return button;
  }

  if (!animate || prefersReducedMotion) {
    return <div key={`${item.key}-${item.label}-${index}`}>{button}</div>;
  }

  return (
    <motion.div key={`${item.key}-${item.label}-${index}`} variants={menuItemVariants}>
      {button}
    </motion.div>
  );
};

const Header: React.FC<HeaderProps> = ({
  onLogoClick,
  onLoginClick,
  activeTab,
  isAuthenticated: isAuthenticatedProp,
  user: userProp,
  hasSidebar = false,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const navigate = useOrgAwareNavigate();
  const {
    user: authUser,
    logout,
    isSuperAdmin,
  } = useAuth();
  const user = authUser ?? userProp ?? null;
  const isAuthenticated = authUser ? true : (isAuthenticatedProp ?? false);
  const { isTabVisible } = useTabVisibility();
  const prefersReducedMotion = useReducedMotion();
  const allowDevPanelInteraction = isTenantDebugPanelEnabled();

  const handleLogoClick = useCallback(() => {
    try {
      onLogoClick();
    } catch (_) {
      /* noop */
    }
  }, [onLogoClick]);

  const normalizedRole = normalizeRole(user?.role || "");
  const isAdmin = normalizedRole === "admin";
  const roleLabel = getRoleLabel(normalizedRole, isAdmin, isSuperAdmin);

  const visiblePublicItems = getOrderedPublicNavItems(isTabVisible, isSuperAdmin);

  const sheetSections = useMemo<SheetSection[]>(
    () =>
      getMobileSheetSections({
        isTabVisible,
        isAdmin,
        isSuperAdmin,
        normalizedRole,
        userRole: user?.role,
        isAuthenticated,
      }).filter((section) => !section.variant || section.variant !== "superadmin" || isSuperAdmin),
    [isTabVisible, isAdmin, isSuperAdmin, normalizedRole, user?.role, isAuthenticated],
  );

  const desktopShortcutSections = useMemo<DesktopShortcutSection[]>(() => {
    return sheetSections
      .filter((section) => section.items.length > 0)
      .slice(0, 3)
      .map((section) => ({
        id: section.id,
        title: section.title,
        item: section.items[0],
      }));
  }, [sheetSections]);

  /** Remount nav bij dev-rolwissel zodat menu direct ververst (Accordion defaultValue is anders sticky). */
  const navSessionKey = useMemo(
    () =>
      [
        isAuthenticated ? "in" : "out",
        isSuperAdmin ? "sa" : "user",
        normalizedRole,
        user?.id ?? "guest",
        user?.username ?? "",
      ].join(":"),
    [isAuthenticated, isSuperAdmin, normalizedRole, user?.id, user?.username],
  );

  const { workSheetSections, bottomSheetSections } = useMemo(() => {
    const work: SheetSection[] = [];
    const bottom: SheetSection[] = [];
    for (const section of sheetSections) {
      if (section.variant === "superadmin") {
        bottom.push(section);
      } else {
        work.push(section);
      }
    }
    return { workSheetSections: work, bottomSheetSections: bottom };
  }, [sheetSections]);

  const workAccordionDefaultValue = useMemo(
    () =>
      workSheetSections
        .filter((section) => section.collapsible && section.defaultOpen)
        .map((section) => section.id),
    [workSheetSections],
  );

  const navigateToTab = (key: string) => {
    setIsSheetOpen(false);
    const path = NAV_ROUTE_MAP[key] || getPathFromTab(key);
    navigate(path);
  };

  const handleLogout = () => {
    setIsSheetOpen(false);
    logout();
  };

  const renderNavGroup = (title: string, items: NavItem[], animate = true) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
        {title}
      </h3>
      <motion.div
        className="space-y-2"
        variants={animate && !prefersReducedMotion ? menuContainerVariants : undefined}
        initial={animate && !prefersReducedMotion ? "hidden" : false}
        animate={animate && !prefersReducedMotion ? "show" : false}
      >
        {items.map((item, index) => (
          <NavLinkButton
            key={`${item.key}-${item.label}-${index}`}
            item={item}
            isActive={activeTab === item.key}
            onNavigate={navigateToTab}
            index={index}
            animate={animate}
          />
        ))}
      </motion.div>
    </div>
  );

  const renderSectionItems = (items: NavItem[]) => (
    <motion.div
      className="space-y-2"
      variants={prefersReducedMotion ? undefined : menuContainerVariants}
      initial={prefersReducedMotion ? false : "hidden"}
      animate={prefersReducedMotion ? false : "show"}
    >
      {items.map((item, index) => (
        <NavLinkButton
          key={`${item.key}-${item.label}-${index}`}
          item={item}
          isActive={activeTab === item.key}
          onNavigate={navigateToTab}
          index={index}
        />
      ))}
    </motion.div>
  );

  const renderAuthNavBlock = (
    sections: SheetSection[],
    blockKey: string,
    defaultOpen: string[],
  ) => {
    if (sections.length === 0) return null;

    const firstCollapsibleIndex = sections.findIndex((section) => section.collapsible);

    return sections.map((section, index) => {
      if (!section.collapsible) {
        return (
          <div key={section.id}>
            {renderNavGroup(section.title, section.items)}
          </div>
        );
      }

      if (index !== firstCollapsibleIndex) {
        return null;
      }

      return (
        <Accordion
          key={blockKey}
          type="multiple"
          defaultValue={defaultOpen}
          className="space-y-2"
        >
          {sections
            .filter((item) => item.collapsible)
            .map((item) => renderSheetSection(item))}
        </Accordion>
      );
    });
  };

  const renderSheetSection = (section: SheetSection) => {
    const triggerClass =
      section.variant === "superadmin" ? superadminAccordionTriggerClass : accordionTriggerClass;

    if (!section.collapsible) {
      return (
        <div
          key={section.id}
          className={cn(section.variant === "superadmin" && "rounded-lg border border-violet-200/80 bg-violet-50/40 p-2")}
        >
          {section.variant === "superadmin" ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 px-2">
              <h3 className={cn(superadminSectionHeadingClass, "px-2")}>
                {section.title}
              </h3>
              {section.badge ? <span className={superadminBadgeClass}>{section.badge}</span> : null}
            </div>
          ) : (
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
              {section.title}
            </h3>
          )}
          {renderSectionItems(section.items)}
        </div>
      );
    }

    return (
      <AccordionItem
        key={section.id}
        value={section.id}
        className={cn(
          "border-none",
          section.variant === "superadmin" && "rounded-lg border border-violet-200/80 bg-violet-50/40 px-1",
        )}
      >
        <AccordionTrigger className={triggerClass}>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">{section.title}</span>
            {section.badge ? (
              <span className={superadminBadgeClass}>{section.badge}</span>
            ) : null}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-2 pt-2">
          {section.variant === "superadmin" ? (
            <p className="px-2 text-[11px] leading-snug text-violet-900/70">
              Alleen zichtbaar en bedoeld voor SuperAdmin-beheer.
            </p>
          ) : null}
          {renderSectionItems(section.items)}
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <header className="bg-brand-600 shadow-lg sticky top-0 z-50 backdrop-blur-sm">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-brand-900 focus:shadow-lg focus:outline-none"
      >
        Naar hoofdinhoud
      </a>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16">
          <div className="flex items-center gap-3 lg:gap-6 flex-1 min-w-0">
            {isAuthenticated && hasSidebar && (
              <SidebarTrigger className="p-2 rounded-md transition-all sidebar-trigger" />
            )}
            <div className="hidden lg:block shrink-0">
              <Logo onClick={handleLogoClick} />
            </div>
            {/* Ingelogde snelkoppelingen zijn beschikbaar via de zijbalk — niet meer duplicaat in de header op desktop. */}
          </div>

          {visiblePublicItems.length > 0 && (
            <nav
              className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-1"
              aria-label="Hoofdnavigatie"
            >
              {visiblePublicItems.map((item) => (
                <NavLinkButton
                  key={item.key}
                  item={item}
                  isActive={activeTab === item.key}
                  onNavigate={navigateToTab}
                  variant="desktop"
                  animate={false}
                />
              ))}
            </nav>
          )}

          <div className="absolute left-1/2 -translate-x-1/2 lg:hidden">
            <Logo onClick={handleLogoClick} />
          </div>

          <Sheet
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            modal={!allowDevPanelInteraction}
          >
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-2 text-white bg-brand-200 hover:bg-brand-300 transition-all duration-200 motion-safe:hover:scale-105"
                aria-label="Open navigatiemenu"
              >
                <HamburgerIcon className="transition-transform duration-200 text-brand-900" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="navigation-modal w-full max-w-sm border-l border-brand-200 shadow-2xl flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden !gap-0 p-0"
              style={{ backgroundColor: "var(--color-100)" }}
            >
              <SheetHeader className="border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0 pr-16 sm:pr-14">
                <SheetTitle className={isAuthenticated ? "sr-only" : "text-2xl font-bold text-brand-800 text-left"}>
                  Navigatie
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Navigeer door de verschillende secties van de website
                </SheetDescription>

                {isAuthenticated && (
                  <button
                    key={navSessionKey}
                    type="button"
                    className="w-full min-h-[44px] p-4 bg-brand-200 rounded-xl shadow-sm border border-brand-200 text-left hover:bg-brand-300/80 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                    onClick={() => {
                      setIsSheetOpen(false);
                      navigate(ADMIN_ROUTES.profile);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-brand-800 rounded-full flex items-center justify-center shadow-md shrink-0">
                        <User size={24} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-brand-900 text-sm">Mijn profiel</p>
                        <p className="truncate text-xs text-brand-800/90 mt-0.5">
                          {user?.username || user?.email}
                        </p>
                        <span className="text-xs text-brand-900 bg-white/80 px-2 py-1 rounded-full inline-block mt-1.5">
                          {roleLabel}
                        </span>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-brand-800" aria-hidden />
                    </div>
                  </button>
                )}
              </SheetHeader>

              <nav
                key={navSessionKey}
                aria-label="Mobiel menu"
                className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-behavior-contain scrollbar-hide px-6 py-4"
              >
                <div className="space-y-6">
                {visiblePublicItems.length > 0 && (
                  <div className="lg:hidden">
                    {isAuthenticated ? (
                      <Accordion type="multiple" defaultValue={[]} className="space-y-2">
                        <AccordionItem value="public-info" className="border-none">
                          <AccordionTrigger className={accordionTriggerClass}>
                            Informatie
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pt-2">
                            {renderSectionItems(visiblePublicItems)}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    ) : (
                      renderNavGroup("Informatie", visiblePublicItems)
                    )}
                  </div>
                )}

                {isAuthenticated &&
                  renderAuthNavBlock(
                    workSheetSections,
                    `${navSessionKey}-work`,
                    workAccordionDefaultValue,
                  )}
                </div>

                {isAuthenticated && isSuperAdmin && bottomSheetSections.length > 0 && (
                  <div
                    className="mt-auto border-t border-violet-200/90 pt-4"
                    role="group"
                    aria-label="SuperAdmin navigatie"
                  >
                    <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-violet-800/80">
                      SuperAdmin zone
                    </p>
                    {renderAuthNavBlock(
                      bottomSheetSections,
                      `${navSessionKey}-superadmin`,
                      [],
                    )}
                  </div>
                )}
              </nav>

              <footer className="mt-auto flex-shrink-0 w-full border-t border-gray-200 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {!isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => {
                      onLoginClick();
                      setIsSheetOpen(false);
                    }}
                    className="btn-nav active w-full flex items-center justify-center gap-2"
                  >
                    <User size={18} className="flex-shrink-0" aria-hidden />
                    Inloggen
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="btn-nav w-full flex items-center justify-center gap-2"
                  >
                    <LogOut size={18} className="flex-shrink-0" aria-hidden />
                    Uitloggen
                  </button>
                )}
              </footer>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
