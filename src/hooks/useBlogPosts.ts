import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { blogService } from "@/services/blogService";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";

export const useBlogPosts = () => {
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const query = useQuery({
    queryKey: withOrgQueryKey(["blogPosts"], organizationId),
    queryFn: () => blogService.getPublishedBlogPosts(organizationId!),
    enabled: orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });

  const hasData = query.data !== undefined;
  const waitingForData = !hasData && query.isFetching;
  const loadingGate = useMinLoadingGate(waitingForData);

  const isListLoading =
    !loadingGate.timedOut &&
    !hasData &&
    (waitingForData || !loadingGate.minReady);

  const isRefreshing = hasData && query.isFetching && !query.isLoading;

  const displayError = loadingGate.timedOut
    ? new Error("Het laden van nieuws duurt te lang (>5 seconden).")
    : query.error;

  const showError = !!displayError && !hasData && !isListLoading;

  return {
    blogPosts: query.data,
    isListLoading,
    isRefreshing,
    showError,
    error: displayError,
    refetch: query.refetch,
    isFetched: query.isFetched,
    isPlaceholderData: query.isPlaceholderData,
  };
};
