import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, UserCheck, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { assignmentService } from '@/services/scheidsrechter/assignmentService';
import type { AvailableReferee } from '@/services/scheidsrechter/types';
import { cn } from '@/lib/utils';
import { formatTimeForDisplay } from '@/lib/dateUtils';
import { useAuth } from '@/hooks/useAuth';

interface MatchData {
  match_id: number;
  match_date: string;
  location: string | null;
  home_team_name: string;
  away_team_name: string;
  assigned_referee_id: number | null;
  current_referee_name?: string;
  current_assignment?: any;
}

interface SessionAssignmentCardProps {
  matches: MatchData[];
  onAssignmentChange: () => void;
}

const AssignmentCard: React.FC<SessionAssignmentCardProps> = ({
  matches,
  onAssignmentChange
}) => {
  const { user } = useAuth();
  const [availableReferees, setAvailableReferees] = useState<AvailableReferee[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedReferee, setSelectedReferee] = useState<string>('');

  // Check if session is assigned (any match has a referee)
  const assignedMatch = matches.find(m => m.assigned_referee_id || m.current_referee_name);
  const isAssigned = !!assignedMatch;
  const refereeName = assignedMatch?.current_referee_name;
  

  // Use first match to fetch available referees
  const firstMatch = matches[0];

  useEffect(() => {
    const fetchAvailable = async () => {
      setLoading(true);
      try {
        const referees = await assignmentService.getAvailableRefereesForMatch(firstMatch.match_id);
        setAvailableReferees(referees);
      } catch (error) {
        console.error('Error fetching available referees:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAvailable();
  }, [firstMatch.match_id]);

  const handleAssign = async (refereeId: string) => {
    if (!refereeId) return;
    setAssigning(true);
    setSelectedReferee(refereeId);
    try {
      const result = await assignmentService.assignReferee({
        match_id: firstMatch.match_id,
        referee_id: parseInt(refereeId),
      });

      if (result.success) {
        toast.success('Scheidsrechter toegewezen');
        setSelectedReferee('');
        onAssignmentChange();
      } else {
        toast.error(result.error || 'Fout bij toewijzen');
        setSelectedReferee('');
      }
    } catch (error) {
      console.error('Error assigning referee to session:', error);
      toast.error('Onverwachte fout');
      setSelectedReferee('');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async () => {
    setAssigning(true);
    try {
      const userId = user?.id || 0;
      const success = await assignmentService.removeMatchAssignment(firstMatch.match_id, userId);
      if (success) {
        toast.success('Toewijzing verwijderd');
        onAssignmentChange();
      } else {
        toast.error('Kon toewijzingen niet verwijderen');
      }
    } catch (error) {
      console.error('Error removing session assignment:', error);
      toast.error('Onverwachte fout');
    } finally {
      setAssigning(false);
    }
  };

  const sortedReferees = [...availableReferees].sort((a, b) => {
    if (a.is_available && !b.is_available) return -1;
    if (!a.is_available && b.is_available) return 1;
    return a.username.localeCompare(b.username);
  });

  return (
    <Card className={cn(
      "transition-all",
      isAssigned && "border-primary/50 bg-primary/5"
    )}>
      <CardContent className="p-4">
        {/* Match list */}
        <div className="space-y-2 mb-4">
          {matches.map(match => (
            <div key={match.match_id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[3rem]">
                  <Clock className="h-3 w-3" />
                  <span>{formatTimeForDisplay(match.match_date)}</span>
                </div>
                <span className="font-medium text-sm">
                  {match.home_team_name} vs {match.away_team_name}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Current Assignment */}
        {isAssigned && refereeName && (
          <div className="flex items-center justify-between p-2 rounded-md bg-primary/10 mb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <span className="font-medium">{refereeName}</span>
            </div>
            <Button
              type="button"
              variant="unstyled"
              className="btn btn--icon btn--danger"
              onClick={handleRemoveAssignment}
              disabled={assigning}
              aria-label="Toewijzing verwijderen"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}

        {/* Assignment Section */}
        {!isAssigned && (
          <div className="space-y-2">
            <Select
              value={selectedReferee}
              onValueChange={(value) => handleAssign(value)}
              disabled={loading || assigning}
            >
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Laden..." : assigning ? "Toewijzen..." : "Selecteer scheidsrechter"} />
              </SelectTrigger>
              <SelectContent>
                {sortedReferees.map(referee => (
                  <SelectItem 
                    key={referee.user_id} 
                    value={referee.user_id.toString()}
                    disabled={referee.has_conflict}
                  >
                    <div className="flex items-center gap-2">
                      <span>{referee.username}</span>
                      {referee.is_available && (
                        <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                          Beschikbaar
                        </Badge>
                      )}
                      {referee.has_conflict && (
                        <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Conflict
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {sortedReferees.length === 0 && !loading && (
                  <SelectItem value="_empty" disabled>
                    Geen scheidsrechters gevonden
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Available count */}
        {!isAssigned && !loading && availableReferees.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {availableReferees.filter(r => r.is_available).length} van {availableReferees.length} beschikbaar
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AssignmentCard;
