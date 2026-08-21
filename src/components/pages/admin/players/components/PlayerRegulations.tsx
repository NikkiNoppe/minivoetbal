
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Shield } from "lucide-react";
import { SectionIcon } from "@/components/layout";
import { useOrganizationContent } from "@/hooks/useOrganizationContent";

const PlayerRegulations: React.FC = () => {
  const { playerHighlights } = useOrganizationContent().reglement;

  return (
    <Card className="bg-white">
      <CardHeader className="bg-white">
        <CardTitle className="flex items-center gap-2 text-brand-dark">
          <SectionIcon icon={Shield} />
          Spelersreglement
        </CardTitle>
        <CardDescription className="text-brand-dark">
          Belangrijke regels en richtlijnen voor spelersbeheer
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 bg-white p-6">
        <Alert className="bg-white p-6">
          <Users className="h-4 w-4 text-brand-dark" />
          <AlertDescription className="text-brand-dark space-y-3 ml-6">
            <p className="leading-relaxed"><strong className="text-brand-dark">Maximum spelers:</strong> {playerHighlights.maxPlayers}</p>
            <p className="leading-relaxed"><strong className="text-brand-dark">Teamwijzigingen:</strong> {playerHighlights.transfers}</p>
            <p className="leading-relaxed"><strong className="text-brand-dark">Inschrijving:</strong> {playerHighlights.inscription}</p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default PlayerRegulations;
