
import React from "react";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PastMatch } from "../types";

interface PastMatchesListProps {
  matches: PastMatch[];
}

export const MatchesPastList: React.FC<PastMatchesListProps> = ({ matches }) => {
  return (
    <div className="rounded-md border min-w-0 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="hidden md:table-cell">Code</TableHead>
            <TableHead className="hidden sm:table-cell">Datum</TableHead>
            <TableHead>Wedstrijd</TableHead>
            <TableHead className="w-[4.5rem]">Score</TableHead>
            <TableHead className="hidden lg:table-cell">Locatie</TableHead>
            <TableHead className="hidden lg:table-cell">Scheidsrechter</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matches.map((match) => (
            <TableRow key={match.id}>
              <TableCell className="hidden md:table-cell">
                {match.uniqueNumber ? (
                  <Badge variant="outline" className="bg-primary text-white">
                    {match.uniqueNumber}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  {match.date}
                </div>
              </TableCell>
              <TableCell>
                <div className="min-w-0 font-medium">
                  <div className="truncate">
                    {match.homeTeam} vs {match.awayTeam}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                    {match.date}
                    {match.location ? ` · ${match.location}` : ""}
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-bold tabular-nums whitespace-nowrap">
                {match.homeScore} - {match.awayScore}
              </TableCell>
              <TableCell className="hidden lg:table-cell">{match.location}</TableCell>
              <TableCell className="hidden lg:table-cell">{match.referee}</TableCell>
            </TableRow>
          ))}
          {matches.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                Geen wedstrijden gevonden.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
