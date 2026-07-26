
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/components/pages/login/AuthProvider";
import { DevDebugProvider } from "@/context/DevDebugContext";
import { lazyImport } from "@/utils/lazyImport";
import { OrganizationProvider } from "@/context/OrganizationContext";
import { OrganizationGate } from "@/components/common/OrganizationGate";
import {
  resolveOrganizationFromHostname,
  userBelongsToOrganization,
} from "@/services/organization/resolveOrganization";
import { ModalProvider } from "@/context/ModalContext";
import { TabVisibilityProvider } from "@/context/TabVisibilityContext";
import { PlayerListLockProvider } from "@/context/PlayerListLockContext";
import { ThemeProvider } from "./hooks/use-theme";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PUBLIC_ROUTES, ADMIN_ROUTES, SUPERADMIN_ROUTES } from "./config/routes";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ScrollRestore } from "@/components/common/ScrollRestore";
import TenantDebugPanel from "@/components/admin/TenantDebugPanel";
import { useThemeColorsInit } from "@/hooks/useThemeColors";
import { useRouteMeta } from "@/hooks/useRouteMeta";

// Lazy load main components (retry + reload bij gefaalde HMR dynamic import)
const Index = lazyImport(() => import("./pages/Index"));
const NotFound = lazyImport(() => import("./pages/NotFound"));
const ResetPassword = lazyImport(() => import("./pages/ResetPassword"));
const Unsubscribe = lazyImport(() => import("./pages/Unsubscribe"));
const SuperAdminPlatform = lazyImport(() => import("./pages/SuperAdmin"));
const SuperAdminTenant = lazy(() =>
  import("./pages/SuperAdmin").then((m) => ({ default: m.SuperAdminTenantRoute })),
);
const SuperAdminBeheerRedirect = lazy(() =>
  import("./pages/SuperAdmin").then((m) => ({ default: m.SuperAdminBeheerRedirect })),
);

/** Initializes dynamic theme colors from DB */
function ThemeColorsInitializer({ children }: { children: React.ReactNode }) {
  useThemeColorsInit();
  return <>{children}</>;
}

/** Updates document title, meta tags and canonical URL on every route. */
function RouteMeta() {
  useRouteMeta();
  return null;
}

const App = () => (
  <ThemeProvider defaultTheme="light">
    <AuthProvider>
      <DevDebugProvider>
      <ModalProvider>
        <PlayerListLockProvider>
          <BrowserRouter>
            <OrganizationProvider>
              <ThemeColorsInitializer>
                <OrganizationGate>
                  <TabVisibilityProvider>
                    <TooltipProvider>
                      <Toaster />
                      <Sonner />
                      <ErrorBoundary>
                        <RouteMeta />
                        <ScrollRestore />
                        <Routes>
                    {/* Redirect root to algemeen */}
                    <Route path="/" element={<Navigate to={PUBLIC_ROUTES.algemeen} replace />} />
                    
                    {/* Public routes - Lazy loaded with Suspense */}
                    <Route path={PUBLIC_ROUTES.algemeen} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <Index />
                      </Suspense>
                    } />
                    <Route path={PUBLIC_ROUTES.competitie} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <Index />
                      </Suspense>
                    } />
                    <Route path={PUBLIC_ROUTES.beker} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <Index />
                      </Suspense>
                    } />
                    <Route path={PUBLIC_ROUTES.playoff} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <Index />
                      </Suspense>
                    } />
                    <Route path={PUBLIC_ROUTES.reglement} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <Index />
                      </Suspense>
                    } />
                    <Route path={PUBLIC_ROUTES.kaarten} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={PUBLIC_ROUTES.archief} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <Index />
                      </Suspense>
                    } />
                    
                    {/* Admin routes - Protected with authentication - Lazy loaded with Suspense */}
                    <Route path={ADMIN_ROUTES['match-forms']} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['match-forms-league']} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['match-forms-cup']} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['match-forms-playoffs']} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.players} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.teams} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.users} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.competition} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.playoffs} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.cup} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['season-calendar']} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['season-planning']} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.financial} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.settings} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['platform-beheer']} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.suspensions} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.schorsingen} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES.scheidsrechters} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['blog-management']} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    <Route path={ADMIN_ROUTES['notification']} element={
                      <ProtectedRoute requireAdmin>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    
                    {/* User Profile Route - Protected */}
                    <Route path={ADMIN_ROUTES.profile} element={
                      <ProtectedRoute>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Index />
                        </Suspense>
                      </ProtectedRoute>
                    } />
                    
                    {/* Other routes - Lazy loaded with Suspense */}
                    <Route path="/reset-password" element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <ResetPassword />
                      </Suspense>
                    } />
                    
                    <Route path="/unsubscribe" element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <Unsubscribe />
                      </Suspense>
                    } />

                    {/* SuperAdmin platform — tenant-keuze Harelbeke / Kuurne */}
                    <Route path={SUPERADMIN_ROUTES.platform} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <SuperAdminPlatform />
                      </Suspense>
                    } />
                    <Route path={SUPERADMIN_ROUTES.beheer} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <SuperAdminBeheerRedirect />
                      </Suspense>
                    } />
                    <Route path={`${SUPERADMIN_ROUTES.platform}/:orgSlug`} element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <SuperAdminTenant />
                      </Suspense>
                    } />

                    {/* Catch-all for unknown routes - Lazy loaded with Suspense */}
                    <Route path="*" element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <NotFound />
                      </Suspense>
                    } />
                    </Routes>
                    <TenantDebugPanel />
                      </ErrorBoundary>
                    </TooltipProvider>
                  </TabVisibilityProvider>
                </OrganizationGate>
              </ThemeColorsInitializer>
            </OrganizationProvider>
          </BrowserRouter>
        </PlayerListLockProvider>
      </ModalProvider>
      </DevDebugProvider>
    </AuthProvider>
  </ThemeProvider>
);

export default App;
