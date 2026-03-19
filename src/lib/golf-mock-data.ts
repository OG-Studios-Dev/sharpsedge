export const MOCK_VALSPAR_DATAGOLF = {
  rankings: [
    { name: "Scottie Scheffler", rank: 1, dgRating: 2.85, sgTotal: 2.12, sgAPP: 1.45, sgT2G: 2.01, sgPUTT: 0.11 },
    { name: "Xander Schauffele", rank: 2, dgRating: 2.41, sgTotal: 1.89, sgAPP: 1.23, sgT2G: 1.67, sgPUTT: 0.22 },
    { name: "Rory McIlroy", rank: 3, dgRating: 2.34, sgTotal: 1.76, sgAPP: 1.12, sgT2G: 1.54, sgPUTT: 0.22 },
    // ... 47 more mock players
  ],
  predictions: [
    { name: "Scheffler", winProb: 18.2, top5Prob: 52.1, top10Prob: 71.3, makeCutProb: 98.7 },
    { name: "McIlroy", winProb: 12.8, top5Prob: 41.2, top10Prob: 63.4, makeCutProb: 97.1 },
    // ... more
  ],
  courseFit: [
    { name: "Sam Burns", fitScore: 92, fitRank: 1 },
    { name: "Justin Thomas", fitScore: 89, fitRank: 2 },
    // Copperhead specialists
  ]
};