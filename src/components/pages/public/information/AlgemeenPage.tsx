import React, { memo, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Home} from "lucide-react";
import type { BlogPost } from "@/services/blogService";
import { formatDateShort } from "@/lib/dateUtils";
import { useBlogPosts } from "@/hooks/useBlogPosts";
import { useOrganizationContent } from "@/hooks/useOrganizationContent";
import { cn } from "@/lib/utils";
import { PageHeader, PublicPage, PublicSectionHeading, PUBLIC_CARD_CLASS } from "@/components/layout";

const CONTENT_PREVIEW_LENGTH = 240;

const CompetitionInfo = memo(({ aboutParagraph }: { aboutParagraph: string }) => {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId}>
      <PublicSectionHeading id={headingId}>Over de competitie</PublicSectionHeading>
      <Card className={PUBLIC_CARD_CLASS}>
        <CardContent className="pt-6 text-sm">
          <p>{aboutParagraph}</p>
        </CardContent>
      </Card>
    </section>
  );
});

const NewsItemSkeleton = memo(() => (
  <Card className={cn("w-full", PUBLIC_CARD_CLASS)}>
    <CardHeader className="pb-3">
      <Skeleton className="h-4 w-20 mb-2" />
      <Skeleton className="h-6 w-3/4" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-2/3" />
    </CardContent>
  </Card>
));

const BlogPostItem = memo(({ post }: { post: BlogPost }) => {
  const [expanded, setExpanded] = useState(false);
  const hasContent = post.setting_value?.title || post.setting_value?.content;

  if (!hasContent) {
    return null;
  }

  const content = post.setting_value?.content ?? "";
  const needsTruncate = content.length > CONTENT_PREVIEW_LENGTH;
  const displayContent =
    expanded || !needsTruncate
      ? content
      : `${content.slice(0, CONTENT_PREVIEW_LENGTH).trimEnd()}…`;

  return (
    <Card className={cn("w-full", PUBLIC_CARD_CLASS)}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-2 gap-2">
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {post.setting_value.published_at && formatDateShort(post.setting_value.published_at)}
          </span>
        </div>
        {post.setting_value?.title && (
          <CardTitle className="break-words text-lg">
            {post.setting_value.title}
          </CardTitle>
        )}
      </CardHeader>
      {content && (
        <CardContent>
          <div className="relative">
            <p className="text-sm break-words whitespace-pre-line">{displayContent}</p>
            {needsTruncate && !expanded && (
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white via-white/60 to-transparent"
                aria-hidden
              />
            )}
          </div>
          {needsTruncate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 min-h-[44px] gap-1.5 px-0 font-medium text-primary hover:bg-transparent hover:text-primary/80"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  Minder tonen
                  <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                </>
              ) : (
                <>
                  Lees meer
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                </>
              )}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
});

const NewsSection = memo(() => {
  const {
    blogPosts,
    isListLoading,
    isRefreshing,
    showError,
    error,
    refetch,
    isFetched,
    isPlaceholderData,
  } = useBlogPosts();

  const postsWithContent = useMemo(
    () =>
      (blogPosts ?? []).filter(
        (post) => post.setting_value?.title || post.setting_value?.content,
      ),
    [blogPosts],
  );

  const showEmpty =
    isFetched &&
    !isPlaceholderData &&
    postsWithContent.length === 0 &&
    !isListLoading &&
    !showError;

  const renderContent = () => {
    if (isListLoading) {
      return (
        <div className="space-y-3 w-full">
          {[...Array(3)].map((_, index) => (
            <NewsItemSkeleton key={index} />
          ))}
        </div>
      );
    }

    if (showError) {
      return (
        <Card className={cn("w-full", PUBLIC_CARD_CLASS)} role="alert">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" aria-hidden />
            <h3 className="text-lg font-semibold mb-2 text-foreground">Fout bij laden</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {error instanceof Error ? error.message : "De nieuwsberichten konden niet worden geladen."}
            </p>
            <Button
              type="button"
              onClick={() => void refetch()}
              className="min-h-[44px]"
            >
              Opnieuw proberen
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (showEmpty) {
      return (
        <Card className={cn("w-full", PUBLIC_CARD_CLASS)}>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">Geen nieuws beschikbaar</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div
        className={`space-y-3 w-full transition-opacity ${isRefreshing ? "opacity-80" : ""}`}
      >
        {postsWithContent.map((post) => (
          <BlogPostItem key={post.id} post={post} />
        ))}
      </div>
    );
  };

  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId}>
      <PublicSectionHeading
        id={headingId}
        action={
          isRefreshing && !isListLoading ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Vernieuwen…
            </span>
          ) : undefined
        }
      >
        Laatste Nieuws
      </PublicSectionHeading>
      {renderContent()}
    </section>
  );
});

const AlgemeenPage: React.FC = () => {
  const { algemeen } = useOrganizationContent();

  return (
    <PublicPage>
      <PageHeader title={algemeen.title} subtitle={algemeen.subtitle} icon={Home} />

      <CompetitionInfo aboutParagraph={algemeen.aboutParagraph} />
      <NewsSection />
    </PublicPage>
  );
};

CompetitionInfo.displayName = "CompetitionInfo";
NewsItemSkeleton.displayName = "NewsItemSkeleton";
BlogPostItem.displayName = "BlogPostItem";
NewsSection.displayName = "NewsSection";

export default AlgemeenPage;
