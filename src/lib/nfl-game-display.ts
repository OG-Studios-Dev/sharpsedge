type NFLGameState = {
  status: string;
  quarter?: string | null;
};

export function shouldShowNFLScore(game: NFLGameState): boolean {
  return Boolean(game.quarter) || /^final/i.test(game.status);
}

export default {
  shouldShowNFLScore,
};
