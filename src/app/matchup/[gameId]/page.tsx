import MatchupResearchClient from "@/components/matchup/MatchupResearchClient";

export default function MatchupPage({ params }: { params: { gameId: string } }) {
  return <MatchupResearchClient apiPath={`/api/matchup/${params.gameId}`} title="Matchup" />;
}
