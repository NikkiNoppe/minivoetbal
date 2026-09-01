import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import {
  fetchAdminRefereeNoteAcks,
  fetchAdminRefereeNotes,
  setAdminRefereeNoteAck,
  type AdminRefereeNoteRow,
} from "@/services/admin/adminRefereeNoteAckSessionFetch";

export const adminRefereeNotesQueryKey = ["adminRefereeNotes"] as const;
export const adminRefereeNoteAcksQueryKey = ["adminRefereeNoteAcks"] as const;

export interface AdminRefereeNoteView extends AdminRefereeNoteRow {
  isAcknowledged: boolean;
}

function mergeNotesWithAcks(
  notes: AdminRefereeNoteRow[],
  acks: { match_id: number; note_fingerprint: string }[],
): AdminRefereeNoteView[] {
  const ackMap = new Map(acks.map((a) => [a.match_id, a.note_fingerprint]));
  return notes.map((note) => ({
    ...note,
    isAcknowledged: ackMap.get(note.match_id) === note.note_fingerprint,
  }));
}

export function useAdminRefereeNotes() {
  const { user } = useAuth();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const enabled = orgQueryEnabled && isAdmin && !!user?.id;

  const notesQuery = useQuery({
    queryKey: withOrgQueryKey(adminRefereeNotesQueryKey, organizationId),
    queryFn: fetchAdminRefereeNotes,
    enabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });

  const acksQuery = useQuery({
    queryKey: withOrgQueryKey([...adminRefereeNoteAcksQueryKey, user?.id], organizationId),
    queryFn: fetchAdminRefereeNoteAcks,
    enabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });

  const notesWithAcks = useMemo(() => {
    if (!notesQuery.data) return undefined;
    return mergeNotesWithAcks(notesQuery.data, acksQuery.data ?? []);
  }, [notesQuery.data, acksQuery.data]);

  const { unread, acknowledged } = useMemo(() => {
    const all = notesWithAcks ?? [];
    return {
      unread: all.filter((n) => !n.isAcknowledged),
      acknowledged: all.filter((n) => n.isAcknowledged),
    };
  }, [notesWithAcks]);

  const toggleAckMutation = useMutation({
    mutationFn: async ({
      matchId,
      acknowledged,
    }: {
      matchId: number;
      acknowledged: boolean;
    }) => {
      await setAdminRefereeNoteAck(matchId, acknowledged);
    },
    onMutate: async ({ matchId, acknowledged }) => {
      const ackKey = withOrgQueryKey([...adminRefereeNoteAcksQueryKey, user?.id], organizationId);
      await queryClient.cancelQueries({ queryKey: ackKey });

      const previousAcks = queryClient.getQueryData<{ match_id: number; note_fingerprint: string; acknowledged_at: string }[]>(ackKey);
      const note = notesQuery.data?.find((n) => n.match_id === matchId);

      if (acknowledged && note) {
        queryClient.setQueryData(ackKey, (old: typeof previousAcks) => {
          const rest = (old ?? []).filter((a) => a.match_id !== matchId);
          return [
            {
              match_id: matchId,
              note_fingerprint: note.note_fingerprint,
              acknowledged_at: new Date().toISOString(),
            },
            ...rest,
          ];
        });
      } else {
        queryClient.setQueryData(ackKey, (old: typeof previousAcks) =>
          (old ?? []).filter((a) => a.match_id !== matchId),
        );
      }

      return { previousAcks };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAcks) {
        const ackKey = withOrgQueryKey([...adminRefereeNoteAcksQueryKey, user?.id], organizationId);
        queryClient.setQueryData(ackKey, context.previousAcks);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: withOrgQueryKey(adminRefereeNoteAcksQueryKey, organizationId),
      });
    },
  });

  const isLoading =
    enabled &&
    ((notesQuery.isFetching && notesQuery.data === undefined) ||
      (acksQuery.isFetching && acksQuery.data === undefined));

  return {
    notes: notesWithAcks ?? [],
    unread,
    acknowledged,
    isLoading,
    error: notesQuery.error || acksQuery.error,
    toggleAcknowledged: (matchId: number, acknowledged: boolean) =>
      toggleAckMutation.mutateAsync({ matchId, acknowledged }),
    isToggling: toggleAckMutation.isPending,
    refetch: async () => {
      await Promise.all([notesQuery.refetch(), acksQuery.refetch()]);
    },
  };
}
