import React, { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCollapsibleCard, SECTION_COLLAPSIBLE_NESTED_TRIGGER } from "@/components/layout";
import { useAdminRefereeNotes, type AdminRefereeNoteView } from "@/hooks/useAdminRefereeNotes";

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const NoteItem: React.FC<{
  note: AdminRefereeNoteView;
  isAcknowledged: boolean;
  onToggle: (matchId: number, acknowledged: boolean) => void;
  disabled?: boolean;
}> = ({ note, isAcknowledged, onToggle, disabled }) => (
  <div
    className={cn(
      "flex gap-3 p-3 rounded-lg border transition-colors",
      isAcknowledged
        ? "bg-muted/30 border-border/50 opacity-70"
        : "bg-card border-border hover:border-primary/30",
    )}
  >
    <Checkbox
      checked={isAcknowledged}
      disabled={disabled}
      onCheckedChange={(checked) => onToggle(note.match_id, checked === true)}
      className="mt-0.5 flex-shrink-0"
      aria-label={
        isAcknowledged
          ? "Markeer als niet afgehandeld"
          : "Markeer als afgehandeld"
      }
    />
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        {note.speeldag && (
          <span className="text-xs font-medium text-muted-foreground">
            {note.speeldag}
          </span>
        )}
        <span className="text-sm font-semibold text-foreground truncate">
          {note.home_team_name} vs {note.away_team_name}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatDate(note.match_date)}</span>
        {note.referee && (
          <>
            <span>·</span>
            <span>Ref: {note.referee}</span>
          </>
        )}
      </div>
      <p className="text-sm text-foreground/80 italic leading-relaxed">
        &ldquo;{note.referee_notes}&rdquo;
      </p>
    </div>
  </div>
);

const RefereeNotesCard: React.FC<{ accordionValue?: string }> = ({
  accordionValue = "referee-notes",
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    unread,
    acknowledged,
    isLoading,
    error,
    toggleAcknowledged,
    isToggling,
    refetch,
  } = useAdminRefereeNotes();

  const handleToggle = useCallback(
    async (matchId: number, acknowledgedNext: boolean) => {
      try {
        await toggleAcknowledged(matchId, acknowledgedNext);
      } catch (err) {
        console.error("Kon afhandeling niet opslaan:", err);
      }
    },
    [toggleAcknowledged],
  );

  if (isLoading) {
    return (
      <SectionCollapsibleCard
        title="Scheidsrechter notities"
        icon={MessageSquare}
        accordionValue={accordionValue}
        contentClassName="space-y-3"
      >
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </SectionCollapsibleCard>
    );
  }

  if (error) {
    return (
      <SectionCollapsibleCard
        title="Scheidsrechter notities"
        icon={MessageSquare}
        accordionValue={accordionValue}
        contentClassName="space-y-3"
      >
        <p className="text-sm text-destructive">
          Kon notities niet laden.{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void refetch()}
          >
            Opnieuw proberen
          </button>
        </p>
      </SectionCollapsibleCard>
    );
  }

  if (unread.length === 0 && acknowledged.length === 0) return null;

  return (
    <SectionCollapsibleCard
      title="Scheidsrechter notities"
      icon={MessageSquare}
      accordionValue={accordionValue}
      badge={
        unread.length > 0 ? (
          <Badge variant="default" className="text-xs">
            {unread.length} open
          </Badge>
        ) : undefined
      }
      contentClassName="space-y-3"
    >
      {unread.length > 0 ? (
        <div className="space-y-2">
          {unread.map((note) => (
            <NoteItem
              key={note.match_id}
              note={note}
              isAcknowledged={false}
              onToggle={handleToggle}
              disabled={isToggling}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">
          Alle notities zijn afgehandeld
        </p>
      )}

      {acknowledged.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className={SECTION_COLLAPSIBLE_NESTED_TRIGGER}>
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                historyOpen && "rotate-90",
              )}
            />
            <span>Geschiedenis ({acknowledged.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {acknowledged.map((note) => (
              <NoteItem
                key={note.match_id}
                note={note}
                isAcknowledged={true}
                onToggle={handleToggle}
                disabled={isToggling}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </SectionCollapsibleCard>
  );
};

export default RefereeNotesCard;
