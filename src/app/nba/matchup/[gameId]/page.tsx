import MatchupResearchClient from "@/components/matchup/MatchupResearchClient";

export default function NBAMatchupPage({ params }: { params: { gameId: string } }) {
  return <MatchupResearchClient apiPath={`/api/nba/matchup/${params.gameId}`} title="NBA Matchup" />;
}
