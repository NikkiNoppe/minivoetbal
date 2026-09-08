
import React, { Suspense, memo, useMemo, type ComponentType } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useTabVisibility, TabName } from "@/context/TabVisibilityContext";
import { lazyImport } from "@/utils/lazyImport";
import AlgemeenPage from "./public/information/AlgemeenPage";

const CompetitiePage = lazyImport(() => import("./public/competition/CompetitiePage"));
const PlayOffPage = lazyImport(() => import("./public/competition/PlayOffPage"));
const PublicBekerPage = lazyImport(() => import("./public/competition/PublicBekerPage"));
const KaartenPage = lazyImport(() => import("./public/information/KaartenPage"));
const ReglementPage = lazyImport(() => import("./public/information/ReglementPage"));
const ScheidsrechtersPage = lazyImport(() => import("./admin/scheidsrechter/ScheidsrechtersPage"));
const ArchiefPage = lazyImport(() => import("./public/archive/ArchiefPage"));

interface MainPagesProps {
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
}

const MAIN_PAGE_TABS = [
  "algemeen",
  "beker",
  "competitie",
  "playoff",
  "kaarten",
  "reglement",
  "scheidsrechters",
  "archief",
] as const;

type MainPageTab = (typeof MAIN_PAGE_TABS)[number];

const PAGE_BY_TAB: Record<MainPageTab, ComponentType> = {
  algemeen: AlgemeenPage,
  beker: PublicBekerPage,
  competitie: CompetitiePage,
  playoff: PlayOffPage,
  kaarten: KaartenPage,
  reglement: ReglementPage,
  scheidsrechters: ScheidsrechtersPage,
  archief: ArchiefPage,
};

const TabContentSkeleton = memo(() => (
  <div className="space-y-6" aria-busy="true">
    <span className="sr-only">Laden…</span>
    <div className="flex justify-between items-center">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-24" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  </div>
));

TabContentSkeleton.displayName = "TabContentSkeleton";

const TabContentWrapper = memo(({ children }: { children: React.ReactNode }) => (
  <div className="animate-fade-in">{children}</div>
));

TabContentWrapper.displayName = "TabContentWrapper";

const MainPages: React.FC<MainPagesProps> = ({ activeTab, setActiveTab }) => {
  const { isTabVisible, loading } = useTabVisibility();

  const visibleKeys = useMemo(
    () => MAIN_PAGE_TABS.filter((key) => isTabVisible(key)),
    [isTabVisible],
  );

  const currentValue = useMemo((): MainPageTab => {
    if (visibleKeys.includes(activeTab as MainPageTab)) {
      return activeTab as MainPageTab;
    }
    return visibleKeys[0] ?? "algemeen";
  }, [activeTab, visibleKeys]);

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="space-y-6">
            <div className="flex justify-center items-center py-8">
              <div className="text-brand-600 flex items-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600"></div>
                <span>Tabs laden...</span>
              </div>
            </div>
            <TabContentSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const ActivePage = PAGE_BY_TAB[currentValue];

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-7xl mx-auto">
        <Tabs
          value={currentValue}
          onValueChange={(value) => setActiveTab(value as TabName)}
          className="w-full"
        >
          <TabsContent value={currentValue} className="mt-0">
            <Suspense fallback={<TabContentSkeleton />}>
              <TabContentWrapper>
                <ActivePage />
              </TabContentWrapper>
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default memo(MainPages);
