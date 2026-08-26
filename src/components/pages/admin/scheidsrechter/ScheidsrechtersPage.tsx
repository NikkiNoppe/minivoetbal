import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';
import { AssignmentWorkspace } from './components';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_ROUTES } from '@/config/routes';
import { resolveDefaultSeasonMonth } from '@/lib/refereeSeasonMonths';

const ScheidsrechtersPage = () => {
  const { user, loading } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => resolveDefaultSeasonMonth());

  const userRole = user?.role || null;

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-pulse space-y-2">
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <p className="text-sm text-muted-foreground mt-4">Gebruikersgegevens laden...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userRole) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2 text-foreground">Geen toegang</h2>
            <p className="text-sm text-muted-foreground">
              Log in om toegang te krijgen tot het scheidsrechtersbeheer.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userRole === 'referee') {
    return <Navigate to={`${ADMIN_ROUTES.profile}#referee-planning`} replace />;
  }

  if (userRole === 'admin') {
    return (
      <div className="scheids-page space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Scheidsrechter Beheer</h1>
          <p className="text-muted-foreground mt-1">
            Bekijk beschikbaarheden en wijs scheidsrechters toe aan wedstrijden.
            Scheidsrechters duiden zelf aan wanneer ze kunnen op basis van het speelschema.
          </p>
        </div>

        <AssignmentWorkspace
          selectedMonth={selectedMonth}
          onSelectedMonthChange={setSelectedMonth}
        />
      </div>
    );
  }

  return null;
};

export default ScheidsrechtersPage;
