
import React, { useEffect, useMemo, useRef, useCallback } from "react";
import Header from "@/components/pages/header/Header";
import { useLocation } from "react-router-dom";
import { useOrgAwareNavigate } from "@/hooks/useOrgAwareNavigate";
import Footer from "@/components/pages/footer/Footer";
import { AppModal } from "@/components/modals";
import { LoginModal } from "@/components/modals";
import MainPages from "@/components/pages/MainPages";
import { AdminDashboardLayout } from "@/components/pages/admin/AdminDashboardLayout";
import UserProfilePage from "@/components/pages/user/UserProfilePage";
import { useAuth } from "@/hooks/useAuth";
import { useModal } from "@/context/ModalContext";

import { getTabFromPath, getPathFromTab, PUBLIC_ROUTES, ADMIN_ROUTES } from "@/config/routes";
import { useTabVisibility } from "@/context/TabVisibilityContext";
import { useIsMobile } from "@/hooks/use-mobile";
import PullToRefreshWrapper from "@/components/common/PullToRefreshWrapper";
import { useQueryClient } from "@tanstack/react-query";

const Layout: React.FC = () => {
  const { user } = useAuth();
  const { isLoginModalOpen, openLoginModal, closeLoginModal } = useModal();
  const location = useLocation();
  const navigate = useOrgAwareNavigate();
  const { isTabVisible, loading: tabLoading } = useTabVisibility();
  const previousActiveTab = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  
  // Pull-to-refresh handler - invalidates all queries
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
    // Small delay to let the UI update
    await new Promise(resolve => setTimeout(resolve, 300));
  }, [queryClient]);

  // Admin sections die sidebar gebruiken
  const adminTabs = [
    "match-forms", "match-forms-league", "match-forms-cup", "match-forms-playoffs", "players", "teams", "users", 
    "competition", "playoffs", "cup", "season-calendar", "season-planning", "financial", "settings", "platform-beheer", "schorsingen", "suspensions", "blog-management", "notification"
  ];
  
  // Main public tabs that use MainPages component
  const publicTabs = [
    "algemeen", "beker", "competitie", "playoff", 
    "kaarten", "reglement", "scheidsrechters", "archief"
  ];

  // Determine active tab from URL (single source of truth)
  const activeTab = useMemo(() => {
    const tab = getTabFromPath(location.pathname);
    
    // For public tabs, URL is always the source of truth
    if (tab && publicTabs.includes(tab)) {
      return tab;
    }
    
    // For admin tabs, check URL first
    if (tab && adminTabs.includes(tab)) {
      return tab;
    }
    
    // If URL is an admin route but tab not found, try to match
    if (location.pathname.startsWith('/admin/')) {
      for (const [key, path] of Object.entries(ADMIN_ROUTES)) {
        if (path === location.pathname) {
          return key;
        }
      }
      // Default admin tab if no match
      return "match-forms";
    }
    
    // Default: public tab
    return "algemeen";
  }, [location.pathname, adminTabs, publicTabs]);

  const handleLogoClick = () => {
    navigate(PUBLIC_ROUTES.algemeen);
  };

  /**
   * setActiveTab helper for backward compatibility
   * Navigates to URL for the given tab name
   */
  const setActiveTab = (tab: string) => {
    const path = getPathFromTab(tab);
    navigate(path);
  };

  const handleLoginClick = () => {
    openLoginModal();
  };

  const handleLoginSuccess = () => {
    closeLoginModal();
    // Always redirect to profile page after login
    navigate(ADMIN_ROUTES.profile, { replace: true });
    // Scroll to top after navigation
    window.scrollTo(0, 0);
  };

  // Check if active tab is visible (for tab visibility settings)
  useEffect(() => {
    // Wait for settings to load before checking visibility
    if (tabLoading) return;
    
    // Only trigger if activeTab actually changed
    if (activeTab === previousActiveTab.current) return;
    previousActiveTab.current = activeTab;
    
    // Skip redirect for /algemeen - this is the fallback page (prevents infinite loop)
    if (activeTab === 'algemeen') return;
    
    // Only check for public tabs, admin tabs are handled by ProtectedRoute
    if (publicTabs.includes(activeTab) && !isTabVisible(activeTab)) {
      // Tab is not visible, redirect to first visible public tab
      const visibleTab = publicTabs.find(tab => isTabVisible(tab));
      // Prevent self-redirect and use replace to avoid history spam
      if (visibleTab && visibleTab !== activeTab) {
        navigate(getPathFromTab(visibleTab), { replace: true });
      } else if (!visibleTab) {
        // Fallback to algemeen if no visible tabs (use replace to prevent history spam)
        navigate(PUBLIC_ROUTES.algemeen, { replace: true });
      }
    }
  }, [activeTab, tabLoading]);

  const isAdminSection = user && adminTabs.includes(activeTab);
  const isPublicSection = publicTabs.includes(activeTab);
  const isProfilePage = location.pathname === ADMIN_ROUTES.profile;

  // Voorwaardelijke rendering: Sidebar voor admin, Header voor publiek
  if (isAdminSection) {
    return (
      <>
        <AdminDashboardLayout 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onLogoClick={handleLogoClick}
          onLoginClick={handleLoginClick}
        />
        {/* Global Login Modal */}
        <AppModal
          open={isLoginModalOpen}
          onOpenChange={closeLoginModal}
          title="Inloggen"
          subtitle="Log in op je account om toegang te krijgen tot het systeem"
          size="sm"
          showCloseButton={true}
        >
          <LoginModal onLoginSuccess={handleLoginSuccess} />
        </AppModal>
      </>
    );
  }

  // Publieke layout met Header hamburgermenu
  return (
    <PullToRefreshWrapper onRefresh={handleRefresh} disabled={!isMobile}>
      <div className="min-h-screen flex flex-col bg-brand-100 text-foreground">
        <Header 
          onLogoClick={handleLogoClick} 
          onLoginClick={handleLoginClick}
          activeTab={activeTab}
          isAuthenticated={!!user}
          user={user}
        />
        <main id="main-content" className="flex-1 w-full bg-brand-100 pt-6">
          {isProfilePage ? (
            <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
              <div className="max-w-7xl mx-auto">
                <UserProfilePage />
              </div>
            </div>
          ) : isPublicSection ? (
            <MainPages activeTab={activeTab as any} setActiveTab={setActiveTab as any} />
          ) : (
            <MainPages activeTab="algemeen" setActiveTab={setActiveTab} />
          )}
        </main>
        <Footer />
        {/* Global Login Modal */}
        <AppModal
          open={isLoginModalOpen}
          onOpenChange={closeLoginModal}
          title="Inloggen"
          subtitle="Log in op je account om toegang te krijgen tot het systeem"
          size="sm"
          showCloseButton={true}
        >
          <LoginModal onLoginSuccess={handleLoginSuccess} />
        </AppModal>
      </div>
    </PullToRefreshWrapper>
  );
};

export default Layout;
