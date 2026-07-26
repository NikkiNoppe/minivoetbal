import React, { memo, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Award, AlertCircle, Archive } from "lucide-react";
import { Link } from "react-router-dom";
import MatchesCupCard from "../../admin/matches/components/MatchesCupCard";
import { useCupData, CupMatchDisplay } from "@/hooks/useCupData";
import { PageHeader, PublicPage, PUBLIC_CARD_CLASS, SectionAccordionItem } from "@/components/layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// ============================================================================
// FEATURE: Progress Indicator Component
// TO REMOVE: Delete this component if progress indicator not needed
// ============================================================================
interface ProgressIndicatorProps {
  rounds: Array<{ key: string; label: string; count: number; completed: boolean }>;
  currentRound?: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ rounds, currentRound }) => {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn(
      "flex items-center justify-center gap-2 sm:gap-4 bg-muted/30 rounded-lg",
      isMobile && "overflow-x-auto scrollbar-hide"
    )}>
      {rounds.map((round, index) => {
        const isNextRound = round.key === currentRound && !round.completed;
        
        return (
          <React.Fragment key={round.key}>
            <div className={cn(
              "flex flex-col items-center gap-1 flex-shrink-0",
              isNextRound && "scale-110"
            )}>
              <div 
                className={cn(
                  "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                  round.completed 
                    ? "bg-primary" 
                    : isNextRound
                    ? "bg-primary ring-2 ring-primary"
                    : "bg-muted"
                )}
                style={{
                  color: isNextRound ? 'var(--primary)' : 'var(--accent)'
                }}
              >
                {round.count}
              </div>
              <span 
                className={cn(
                  "text-xs text-center whitespace-nowrap transition-colors",
                  isNextRound ? "font-semibold" : ""
                )}
                style={{ 
                  color: isNextRound ? 'var(--primary)' : 'var(--accent)' 
                }}
              >
                {round.label}
              </span>
            </div>
            {index < rounds.length - 1 && (
              <ChevronRight 
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  isMobile && "mx-1"
                )}
                style={{ color: 'var(--accent)' }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const ChevronRight = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg 
    className={className} 
    style={{ color: 'var(--accent)', ...style }} 
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);



// ============================================================================
// Skeleton Components
// ============================================================================
const MatchCardSkeleton = memo(() => (
  <Card className="w-full">
    <CardHeader className="pb-3">
      <div className="flex justify-between items-start mb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-5 w-32" />
    </CardHeader>
    <CardContent>
      <div className="flex justify-between items-center py-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-3 w-24 mt-2" />
    </CardContent>
  </Card>
));

const TournamentRoundSkeleton = memo(({
  title,
  cardCount
}: {
  title: string;
  cardCount: number;
}) => {
  const headingId = React.useId();
  return (
    <section role="region" aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <h2 id={headingId} className="text-2xl font-semibold leading-none tracking-tight text-primary">
            {title}
          </h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(cardCount)].map((_, index) => (
              <MatchCardSkeleton key={index} />
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
});

// ============================================================================
// FEATURE: Sticky Round Header Component
// TO REMOVE: Remove sticky positioning if not needed
// ============================================================================
interface StickyRoundHeaderProps {
  title: string;
  matchCount: number;
  isEmpty: boolean;
  roundKey: string;
  isFinal?: boolean;
}

const StickyRoundHeader: React.FC<StickyRoundHeaderProps> = ({ 
  title, 
  matchCount, 
  isEmpty, 
  roundKey,
  isFinal = false 
}) => {
  const headingId = React.useId();
  
  return (
    <div 
      className={cn(
        "sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b pb-2 mb-4",
        isFinal && "bg-primary/5 border-primary/20"
      )}
      id={roundKey}
    >
      <div className="flex items-center justify-between">
        <CardTitle 
          id={headingId} 
          className={cn(
            "flex items-center gap-2",
            isFinal && "text-primary text-xl"
          )}
        >
          {isFinal ? <Trophy className="h-6 w-6" /> : <Award className="h-5 w-5" />}
          {title}
        </CardTitle>
        {!isEmpty && (
          <Badge variant="outline" className="text-xs">
            {matchCount} {matchCount === 1 ? 'wedstrijd' : 'wedstrijden'}
          </Badge>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Tournament Round Component with Accordion
// ============================================================================
const TournamentRound = memo(({
  title,
  matches,
  emptyMessage,
  gridCols = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  roundName,
  roundKey,
  isFinal = false
}: {
  title: string;
  matches: CupMatchDisplay[];
  emptyMessage: string;
  gridCols?: string;
  roundName: string;
  roundKey: string;
  isFinal?: boolean;
}) => {
  const headingId = React.useId();
  const isMobile = useIsMobile();
  
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">{title}</h2>
      <SectionAccordionItem
        value={roundKey}
        itemClassName="mb-3"
        triggerContent={
          <div className="flex items-center justify-between w-full gap-3 pr-1">
            <div className="flex items-center gap-2 min-w-0">
              {isFinal ? (
                <Trophy className="h-5 w-5 text-primary shrink-0" aria-hidden />
              ) : (
                <Award className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              )}
              <span className="text-left truncate">{title}</span>
            </div>
            {matches.length > 0 && (
              <Badge variant="outline" className="text-xs shrink-0">
                {matches.length} {matches.length === 1 ? "wedstrijd" : "wedstrijden"}
              </Badge>
            )}
          </div>
        }
      >
        {matches.length > 0 ? (
          <div className={cn(
            "grid gap-3 sm:gap-4 pt-2",
            gridCols,
            isMobile && "gap-3",
            isFinal && "max-w-md mx-auto"
          )}>
            {matches.map(match => (
              <MatchesCupCard 
                key={match.id} 
                id={match.id} 
                home={match.home} 
                away={match.away} 
                homeScore={match.homeScore} 
                awayScore={match.awayScore} 
                date={match.date} 
                time={match.time} 
                location={match.location} 
                nextMatch={match.nextMatch} 
                tournamentRound={roundName} 
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8 text-card-foreground">
            {emptyMessage}
          </p>
        )}
      </SectionAccordionItem>
    </section>
  );
});

// ============================================================================
// Loading Component with Better States
// ============================================================================
const TournamentLoading = memo(() => {
  return (
    <PublicPage>
      <PageHeader 
        title="Beker"
        icon={Award} 
        subtitle="Seizoen 2025/2026"
      />
      
      {/* FEATURE: Show only relevant skeleton rounds */}
      <TournamentRoundSkeleton title="Achtste Finales" cardCount={8} />
      <TournamentRoundSkeleton title="Kwart Finales" cardCount={4} />
      <TournamentRoundSkeleton title="Halve Finales" cardCount={2} />
      <TournamentRoundSkeleton title="Finale" cardCount={1} />
    </PublicPage>
  );
});

// ============================================================================
// Error Component with Retry
// ============================================================================
const TournamentError = memo(({
  error,
  onRetry
}: {
  error: Error;
  onRetry: () => void;
}) => {
  return (
    <PublicPage>
      <PageHeader 
        title="Beker"
        icon={Award} 
        subtitle="Seizoen 2025/2026"
      />
      <Card className={PUBLIC_CARD_CLASS}>
        <CardContent className="py-12">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2 text-foreground">Fout bij laden</h3>
            <p className="text-muted-foreground mb-6">
              {error.message || "Kon toernooigegevens niet laden"}
            </p>
            <Button onClick={onRetry} variant="outline" className="min-h-[44px]">
              Opnieuw proberen
            </Button>
          </div>
        </CardContent>
      </Card>
    </PublicPage>
  );
});

// ============================================================================
// Empty State Component
// ============================================================================
const TournamentEmpty = memo(() => {
  return (
    <PublicPage>
      <PageHeader 
        title="Beker"
        icon={Award} 
        subtitle="Seizoen 2025/2026"
      />
      <Card className={PUBLIC_CARD_CLASS}>
        <CardContent className="py-12">
          <div className="text-center">
            <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2 text-foreground">Geen Toernooi Actief</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Er is momenteel geen bekertoernooi actief. Neem contact op met de beheerder om een toernooi aan te maken.
            </p>
          </div>
        </CardContent>
      </Card>
    </PublicPage>
  );
});


// ============================================================================
// Main Tournament Content Component
// ============================================================================
const TournamentContent = memo(({
  bracketData
}: {
  bracketData: NonNullable<ReturnType<typeof useCupData>['bracketData']>;
}) => {
  const isMobile = useIsMobile();
  const prelimsRef = useRef<HTMLDivElement>(null);
  const eighthfinalsRef = useRef<HTMLDivElement>(null);
  const quarterfinalsRef = useRef<HTMLDivElement>(null);
  const semifinalsRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  
  // FEATURE: Calculate progress for indicator
  const progressRounds = useMemo(() => {
    const rounds = [
      {
        key: 'prelims',
        label: 'VR',
        count: bracketData.prelims.length,
        completed: bracketData.prelims.every(m => 
          m.homeScore !== null && m.awayScore !== null
        )
      },
      {
        key: 'eighthfinals',
        label: '1/8',
        count: bracketData.eighthfinals.length,
        completed: bracketData.eighthfinals.every(m => 
          m.homeScore !== null && m.awayScore !== null
        )
      },
      {
        key: 'quarterfinals',
        label: '1/4',
        count: bracketData.quarterfinals.length,
        completed: bracketData.quarterfinals.every(m => 
          m.homeScore !== null && m.awayScore !== null
        )
      },
      {
        key: 'semifinals',
        label: '1/2',
        count: bracketData.semifinals.length,
        completed: bracketData.semifinals.every(m => 
          m.homeScore !== null && m.awayScore !== null
        )
      },
      {
        key: 'final',
        label: 'F',
        count: bracketData.final ? 1 : 0,
        completed: bracketData.final ? 
          (bracketData.final.homeScore !== null && bracketData.final.awayScore !== null) : 
          false
      }
    ].filter((r) => r.count > 0 || r.key === 'final');
    
    const currentRound = rounds.find(r => r.count > 0 && !r.completed)?.key || 
                        rounds.filter(r => r.count > 0).pop()?.key;
    
    return { rounds, currentRound };
  }, [bracketData]);
  
  
  return (
    <PublicPage>
      {/* Header */}
      <PageHeader 
        title="Beker"
        icon={Award} 
        subtitle="Seizoen 2025/2026"
      />

      <div className="flex justify-end">
        <Link
          to="/archief"
          className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-900 hover:underline font-medium"
        >
          <Archive className="w-4 h-4" />
          Vorige seizoenen
        </Link>
      </div>


      {/* FEATURE: Progress Indicator - Remove this section if not needed */}
      <ProgressIndicator 
        rounds={progressRounds.rounds} 
        currentRound={progressRounds.currentRound}
      />

      {/* Tournament Rounds with Accordion */}
      <Accordion 
        type="single" 
        collapsible 
        defaultValue={progressRounds.currentRound || undefined}
        className="space-y-3"
      >
        {bracketData.prelims.length > 0 && (
          <div ref={prelimsRef}>
            <TournamentRound 
              title="Voorronde" 
              matches={bracketData.prelims} 
              emptyMessage="Geen voorronde beschikbaar" 
              roundName="Voorronde"
              roundKey="prelims"
            />
          </div>
        )}

        {bracketData.eighthfinals.length > 0 && (
          <div ref={eighthfinalsRef}>
            <TournamentRound 
              title="Achtste Finales" 
              matches={bracketData.eighthfinals} 
              emptyMessage="Geen achtste finales beschikbaar" 
              roundName="Achtste Finale"
              roundKey="eighthfinals"
            />
          </div>
        )}

        {bracketData.quarterfinals.length > 0 && (
          <div ref={quarterfinalsRef}>
            <TournamentRound 
              title="Kwart Finales" 
              matches={bracketData.quarterfinals} 
              emptyMessage="Geen kwart finales beschikbaar" 
              roundName="Kwart Finale"
              roundKey="quarterfinals"
            />
          </div>
        )}

        {bracketData.semifinals.length > 0 && (
          <div ref={semifinalsRef}>
            <TournamentRound 
              title="Halve Finales" 
              matches={bracketData.semifinals} 
              emptyMessage="Geen halve finales beschikbaar" 
              gridCols="grid-cols-1 md:grid-cols-2" 
              roundName="Halve Finale"
              roundKey="semifinals"
            />
          </div>
        )}

        {bracketData.final && (
          <div ref={finalRef}>
            <TournamentRound 
              title="Finale" 
              matches={[bracketData.final]} 
              emptyMessage="Finale nog niet beschikbaar" 
              gridCols="grid-cols-1" 
              roundName="Finale"
              roundKey="final"
              isFinal={true}
            />
          </div>
        )}
      </Accordion>
    </PublicPage>
  );
});

// ============================================================================
// Main Component
// ============================================================================
const PublicBekerPage: React.FC = () => {
  const {
    isLoading,
    error,
    bracketData,
    hasData,
    refetch
  } = useCupData();
  
  if (isLoading) {
    return <TournamentLoading />;
  }
  
  if (error) {
    return <TournamentError error={error} onRetry={() => refetch()} />;
  }
  
  if (!hasData || !bracketData) {
    return <TournamentEmpty />;
  }
  
  return <TournamentContent bracketData={bracketData} />;
};

// Set display names for better debugging
MatchCardSkeleton.displayName = 'MatchCardSkeleton';
TournamentRoundSkeleton.displayName = 'TournamentRoundSkeleton';
TournamentRound.displayName = 'TournamentRound';
TournamentLoading.displayName = 'TournamentLoading';
TournamentError.displayName = 'TournamentError';
TournamentEmpty.displayName = 'TournamentEmpty';
TournamentContent.displayName = 'TournamentContent';
ProgressIndicator.displayName = 'ProgressIndicator';
StickyRoundHeader.displayName = 'StickyRoundHeader';

export default memo(PublicBekerPage);
