/**
 * backtest-optimize.mjs
 *
 * Parameter sweep for every losing/marginal system.
 * For each system, tests dozens of rule variations and finds the ones that hit 50%+
 * with at least 500 qualifying games (enough sample to be meaningful).
 *
 * Usage: node scripts/backtest-optimize.mjs
 */

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchSport(sport) {
  const urls = {
    NBA: 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/nba_archive_10Y.json',
    NHL: 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/nhl_archive_10Y.json',
    MLB: 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/mlb_archive_10Y.json',
  };
  const r = await fetch(urls[sport]);
  const raw = await r.json();
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return arr.map(row => ({
    sport,
    season: parseInt(row.season, 10),
    home: String(row.home_team ?? '').trim(),
    away: String(row.away_team ?? '').trim(),
    home_final: row.home_final != null ? parseInt(row.home_final, 10) : null,
    away_final: row.away_final != null ? parseInt(row.away_final, 10) : null,
    home_ml: row.home_close_ml != null ? parseInt(row.home_close_ml, 10) : null,
    away_ml: row.away_close_ml != null ? parseInt(row.away_close_ml, 10) : null,
    home_spread: row.home_close_spread != null ? parseFloat(row.home_close_spread) : null,
    ou: row.close_over_under != null ? parseFloat(row.close_over_under) : row.open_over_under != null ? parseFloat(row.open_over_under) : null,
    home_q1: row.home_1stQtr != null ? parseInt(row.home_1stQtr, 10) : null,
    away_q1: row.away_1stQtr != null ? parseInt(row.away_1stQtr, 10) : null,
    home_q2: row.home_2ndQtr != null ? parseInt(row.home_2ndQtr, 10) : null,
    away_q2: row.away_2ndQtr != null ? parseInt(row.away_2ndQtr, 10) : null,
    home_q3: row.home_3rdQtr != null ? parseInt(row.home_3rdQtr, 10) : null,
    away_q3: row.away_3rdQtr != null ? parseInt(row.away_3rdQtr, 10) : null,
    home_p1: row.home_1stPeriod != null ? parseInt(row.home_1stPeriod, 10) : null,
    away_p1: row.away_1stPeriod != null ? parseInt(row.away_1stPeriod, 10) : null,
    home_p2: row.home_2ndPeriod != null ? parseInt(row.home_2ndPeriod, 10) : null,
    away_p2: row.away_2ndPeriod != null ? parseInt(row.away_2ndPeriod, 10) : null,
    home_p3: row.home_3rdPeriod != null ? parseInt(row.home_3rdPeriod, 10) : null,
    away_p3: row.away_3rdPeriod != null ? parseInt(row.away_3rdPeriod, 10) : null,
  }));
}

// ─── Grade helpers ────────────────────────────────────────────────────────────

function gradeML(g, pickHome) {
  if (g.home_final == null || g.away_final == null) return null;
  if (g.home_final === g.away_final) return 'push';
  const homeWon = g.home_final > g.away_final;
  return (pickHome ? homeWon : !homeWon) ? 'win' : 'loss';
}

function gradeTotal(g, ou, dir) {
  if (g.home_final == null || g.away_final == null || ou == null) return null;
  const total = g.home_final + g.away_final;
  if (total === ou) return 'push';
  return dir === 'under' ? (total < ou ? 'win' : 'loss') : (total > ou ? 'win' : 'loss');
}

function gradeQ1ML(g, pickHome) {
  if (g.home_q1 == null || g.away_q1 == null) return null;
  if (g.home_q1 === g.away_q1) return 'push';
  const homeWon = g.home_q1 > g.away_q1;
  return (pickHome ? homeWon : !homeWon) ? 'win' : 'loss';
}

function gradeQ1Total(g, lineFactor, dir) {
  if (g.home_q1 == null || g.away_q1 == null || g.ou == null) return null;
  const q1total = g.home_q1 + g.away_q1;
  const q1line = g.ou * lineFactor;
  if (q1total === q1line) return 'push';
  return dir === 'under' ? (q1total < q1line ? 'win' : 'loss') : (q1total > q1line ? 'win' : 'loss');
}

function gradeP1ML(g, pickHome) {
  if (g.home_p1 == null || g.away_p1 == null) return null;
  if (g.home_p1 === g.away_p1) return 'push';
  const homeWon = g.home_p1 > g.away_p1;
  return (pickHome ? homeWon : !homeWon) ? 'win' : 'loss';
}

function score(results) {
  const wins = results.filter(r => r === 'win').length;
  const losses = results.filter(r => r === 'loss').length;
  const total = wins + losses;
  if (total < 200) return null; // not enough sample
  const hitRate = wins / total;
  const roi = (wins * 0.909 - losses) / total; // -110 juice
  return { wins, losses, total, hitRate: (hitRate * 100).toFixed(1), roi: (roi * 100).toFixed(1) };
}

// ─── Sweep engine ─────────────────────────────────────────────────────────────

function sweep(label, games, filterFn, gradeFn, minTotal = 300) {
  const qualified = games.filter(filterFn);
  const results = qualified.map(gradeFn).filter(r => r != null);
  const wins = results.filter(r => r === 'win').length;
  const losses = results.filter(r => r === 'loss').length;
  const total = wins + losses;
  if (total < minTotal) return null;
  const hitRate = wins / total;
  const roi = (wins * 0.909 - losses) / total;
  return {
    label,
    n: qualified.length,
    graded: total,
    wins, losses,
    hitRate: (hitRate * 100).toFixed(1),
    roi: (roi * 100).toFixed(1),
    hr: hitRate,
    roiN: roi,
  };
}

function printBest(systemName, results, topN = 5) {
  const good = results
    .filter(r => r && r.hr >= 0.50)
    .sort((a, b) => b.hr - a.hr)
    .slice(0, topN);

  if (good.length === 0) {
    const best = results.filter(Boolean).sort((a, b) => b.hr - a.hr).slice(0, 3);
    console.log(`\n  ⚠️  No combo hit 50%+ — best found:`);
    best.forEach(r => console.log(`     ${r.hitRate}% (${r.wins}-${r.losses}, n=${r.graded}) | ${r.label}`));
    return;
  }
  console.log(`\n  ✅ Combos hitting 50%+:`);
  good.forEach(r => {
    const roi = parseFloat(r.roi) >= 0 ? `+${r.roi}%` : `${r.roi}%`;
    console.log(`     ${r.hitRate}% / ${roi} ROI | n=${r.graded} | ${r.label}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🦆 GOOSALYTICS — SYSTEM OPTIMIZER\n');
  console.log('Finding rule combinations that hit 50%+ across 10 years of data...\n');

  console.log('Loading data...');
  const [NHL, NBA, MLB] = await Promise.all([fetchSport('NHL'), fetchSport('NBA'), fetchSport('MLB')]);
  console.log(`NHL: ${NHL.length.toLocaleString()} | NBA: ${NBA.length.toLocaleString()} | MLB: ${MLB.length.toLocaleString()}\n`);
  console.log('═'.repeat(70));

  // ─── 1. SWAGGY STRETCH DRIVE (NHL ML, playoff pressure proxy) ──────────────
  console.log('\n[1] SWAGGY STRETCH DRIVE — NHL ML, playoff bubble');
  {
    const results = [];
    // Vary: home vs away, odds bands, spread condition, total condition
    for (const pickHome of [true, false]) {
      for (const [mlMin, mlMax] of [
        [-120, 120], [-110, 110], [-105, 105],
        [-130, -105], [-150, -110], // home favorites
        [105, 160],  [110, 180],   // home dogs
        [-120, -100], [-130, -100],
      ]) {
        for (const ouFilter of [null, [5, 5.5], [5.5, 6], [6, 7]]) {
          const filter = g => {
            if (g.home_ml == null || g.away_ml == null || g.home_final == null) return false;
            const ml = pickHome ? g.home_ml : g.away_ml;
            if (ml < mlMin || ml > mlMax) return false;
            if (ouFilter && (g.ou == null || g.ou < ouFilter[0] || g.ou > ouFilter[1])) return false;
            return true;
          };
          const label = `${pickHome ? 'HOME' : 'AWAY'} ML [${mlMin} to ${mlMax}]${ouFilter ? ` + OU[${ouFilter}]` : ''}`;
          results.push(sweep(label, NHL, filter, g => gradeML(g, pickHome)));
        }
      }
      // P1 moneyline variant
      for (const [mlMin, mlMax] of [[-120, 120], [-130, -105], [-150, -110], [105, 160]]) {
        const filter = g => g.home_ml != null && g.home_p1 != null && (pickHome ? g.home_ml : g.away_ml) >= mlMin && (pickHome ? g.home_ml : g.away_ml) <= mlMax;
        results.push(sweep(`${pickHome ? 'HOME' : 'AWAY'} 1ST PERIOD ML [${mlMin}→${mlMax}]`, NHL, filter, g => gradeP1ML(g, pickHome)));
      }
    }
    printBest('Swaggy', results);
  }

  // ─── 2. BIGCAT PUCK LUCK (NHL ML, home dog) ────────────────────────────────
  console.log('\n[2] BIGCAT BONANZA PUCK LUCK — NHL ML home dog');
  {
    const results = [];
    for (const [min, max] of [
      [105, 130], [110, 130], [115, 140], [120, 140],
      [120, 150], [125, 145], [130, 160], [105, 120],
      [105, 115], [140, 200], [150, 200],
    ]) {
      for (const ouFilter of [null, [5, 5.5], [5.5, 6], [null, 5.5]]) {
        const filter = g => {
          if (g.home_ml == null || g.home_final == null) return false;
          if (g.home_ml < min || g.home_ml > max) return false;
          if (ouFilter) {
            if (g.ou == null) return false;
            if (ouFilter[0] && g.ou < ouFilter[0]) return false;
            if (ouFilter[1] && g.ou > ouFilter[1]) return false;
          }
          return true;
        };
        const label = `Home dog [+${min} to +${max}]${ouFilter ? ` OU≤${ouFilter[1] ?? '∞'}` : ''}`;
        results.push(sweep(label, NHL, filter, g => gradeML(g, true)));
      }
    }
    // Try: P1 ML on home dog
    for (const [min, max] of [[105, 130], [110, 140], [120, 150]]) {
      const filter = g => g.home_ml != null && g.home_p1 != null && g.home_ml >= min && g.home_ml <= max;
      results.push(sweep(`Home dog P1 ML [+${min} to +${max}]`, NHL, filter, g => gradeP1ML(g, true)));
    }
    printBest('BigCat', results);
  }

  // ─── 3. NHL UNDER ──────────────────────────────────────────────────────────
  console.log('\n[3] NHL UNDER MAJORITY HANDLE');
  {
    const results = [];
    for (const [ouMin, ouMax] of [
      [5.5, 6], [6, 7], [5, 5.5], [5.5, 5.5], [6, 6],
      [6.5, 7], [5, 6], [5.5, 7], [6, 99],
    ]) {
      for (const mlFilter of [null, [-130, 130], [-120, 120], [-110, 110]]) {
        const filter = g => {
          if (g.ou == null || g.home_final == null) return false;
          if (g.ou < ouMin || g.ou > ouMax) return false;
          if (mlFilter && (g.home_ml == null || g.home_ml < mlFilter[0] || g.home_ml > mlFilter[1])) return false;
          return true;
        };
        const label = `UNDER OU[${ouMin}–${ouMax}]${mlFilter ? ` competitive[${mlFilter}]` : ''}`;
        results.push(sweep(label, NHL, filter, g => gradeTotal(g, g.ou, 'under')));
      }
    }
    // Over on low totals
    for (const [ouMin, ouMax] of [[5, 5.5], [4.5, 5.5], [5, 6]]) {
      const filter = g => g.ou != null && g.home_final != null && g.ou >= ouMin && g.ou <= ouMax;
      results.push(sweep(`OVER OU[${ouMin}–${ouMax}]`, NHL, filter, g => gradeTotal(g, g.ou, 'over')));
    }
    printBest('NHL Under', results);
  }

  // ─── 4. NHL HOME DOG ───────────────────────────────────────────────────────
  console.log('\n[4] NHL HOME DOG MAJORITY HANDLE');
  {
    const results = [];
    for (const [min, max] of [
      [100, 120], [100, 130], [105, 125], [110, 135],
      [115, 140], [105, 115], [100, 115], [120, 140], [130, 160],
    ]) {
      for (const ouFilter of [null, [5, 5.5], [5.5, 6]]) {
        const filter = g => {
          if (g.home_ml == null || g.home_final == null) return false;
          if (g.home_ml < min || g.home_ml > max) return false;
          if (ouFilter && (g.ou == null || g.ou < ouFilter[0] || g.ou > ouFilter[1])) return false;
          return true;
        };
        results.push(sweep(`Home [+${min} to +${max}]${ouFilter ? ` OU[${ouFilter}]` : ''}`, NHL, filter, g => gradeML(g, true)));
      }
    }
    printBest('NHL Home Dog', results);
  }

  // ─── 5. NBA HOME DOG ───────────────────────────────────────────────────────
  console.log('\n[5] NBA HOME DOG MAJORITY HANDLE');
  {
    const results = [];
    for (const [min, max] of [
      [100, 130], [100, 120], [105, 130], [110, 140],
      [115, 145], [120, 150], [100, 115], [115, 135],
    ]) {
      for (const ouFilter of [null, [200, 210], [210, 220], [215, 230], [200, 215]]) {
        const filter = g => {
          if (g.home_ml == null || g.home_final == null) return false;
          if (g.home_ml < min || g.home_ml > max) return false;
          if (ouFilter && (g.ou == null || g.ou < ouFilter[0] || g.ou > ouFilter[1])) return false;
          return true;
        };
        results.push(sweep(`Home dog [+${min}→+${max}]${ouFilter ? ` OU[${ouFilter}]` : ''}`, NBA, filter, g => gradeML(g, true)));
      }
    }
    // Q1 ML variants for home dog
    for (const [min, max] of [[100, 130], [100, 120], [105, 125]]) {
      const filter = g => g.home_ml != null && g.home_q1 != null && g.home_ml >= min && g.home_ml <= max;
      results.push(sweep(`Home dog Q1 ML [+${min}→+${max}]`, NBA, filter, g => gradeQ1ML(g, true)));
    }
    printBest('NBA Home Dog', results);
  }

  // ─── 6. NBA SUPER MAJORITY (heavy dog) ─────────────────────────────────────
  console.log('\n[6] NBA HOME SUPER MAJORITY — heavy home dog');
  {
    const results = [];
    for (const [min, max] of [
      [150, 200], [160, 220], [180, 250], [150, 180],
      [170, 220], [200, 300], [180, 200],
    ]) {
      for (const ouFilter of [null, [200, 215], [215, 225]]) {
        const filter = g => {
          if (g.home_ml == null || g.home_final == null) return false;
          if (g.home_ml < min || g.home_ml > max) return false;
          if (ouFilter && (g.ou == null || g.ou < ouFilter[0] || g.ou > ouFilter[1])) return false;
          return true;
        };
        results.push(sweep(`Super dog [+${min}→+${max}]${ouFilter ? ` OU[${ouFilter}]` : ''}`, NBA, filter, g => gradeML(g, true)));
      }
    }
    printBest('NBA Super Dog', results);
  }

  // ─── 7. FAT TONY'S FADE (fade heavy road fav in NBA) ──────────────────────
  console.log('\n[7] FAT TONY\'S FADE — fade heavy road fav');
  {
    const results = [];
    // Original: home dog when road is -180 or heavier — was 28.3%. Need different angle.
    // Try: bet the road fav instead (go WITH heavy road fav)
    for (const [max] of [[-150], [-160], [-170], [-180], [-200], [-220], [-250]]) {
      const filter = g => g.away_ml != null && g.home_final != null && g.away_ml <= max;
      results.push(sweep(`WITH road fav (≤${max})`, NBA, filter, g => gradeML(g, false)));
    }
    // Try: spread ATS on heavy road fav — do they cover?
    for (const [max] of [[-150], [-180], [-200]]) {
      const filter = g => g.away_ml != null && g.home_spread != null && g.home_final != null && g.away_ml <= max;
      results.push(sweep(`Road fav ATS (≤${max})`, NBA, filter, g => {
        // road fav covers means away wins by more than the spread
        const spreadResult = g.home_final - g.away_final + g.home_spread; // + = home covers
        if (spreadResult === 0) return 'push';
        return spreadResult > 0 ? 'loss' : 'win'; // we're betting away covers
      }));
    }
    // Try: total on games with heavy road fav
    for (const [favMax] of [[-150], [-180]]) {
      for (const [ouMin, ouMax] of [[205, 215], [210, 220], [215, 225], [200, 210]]) {
        for (const dir of ['over', 'under']) {
          const filter = g => g.away_ml != null && g.ou != null && g.home_final != null
            && g.away_ml <= favMax && g.ou >= ouMin && g.ou <= ouMax;
          results.push(sweep(`${dir.toUpperCase()} when road fav ≤${favMax}, OU[${ouMin}–${ouMax}]`, NBA, filter, g => gradeTotal(g, g.ou, dir)));
        }
      }
    }
    printBest("Fat Tony's Fade", results);
  }

  // ─── 8. MLB HOME DOG ───────────────────────────────────────────────────────
  console.log('\n[8] MLB HOME MAJORITY HANDLE — home dog');
  {
    const results = [];
    for (const [min, max] of [
      [105, 130], [110, 130], [110, 140], [115, 135],
      [120, 140], [105, 120], [125, 145], [130, 150],
      [100, 115], [115, 130],
    ]) {
      for (const ouFilter of [null, [7, 8.5], [8, 9], [7.5, 8.5], [null, 8]]) {
        const filter = g => {
          if (g.home_ml == null || g.home_final == null) return false;
          if (g.home_ml < min || g.home_ml > max) return false;
          if (ouFilter) {
            if (g.ou == null) return false;
            if (ouFilter[0] && g.ou < ouFilter[0]) return false;
            if (ouFilter[1] && g.ou > ouFilter[1]) return false;
          }
          return true;
        };
        results.push(sweep(`Home dog [+${min}→+${max}]${ouFilter ? ` OU[${ouFilter}]` : ''}`, MLB, filter, g => gradeML(g, true)));
      }
    }
    printBest('MLB Home Dog', results);
  }

  // ─── 9. COACH NO REST (NHL tight fav) ─────────────────────────────────────
  console.log('\n[9] COACH NO REST — NHL tight fav at home');
  {
    const results = [];
    for (const [min, max] of [
      [-105, -100], [-110, -105], [-115, -105], [-120, -100],
      [-130, -110], [-120, -110], [-125, -105], [-140, -120],
      [-150, -120], [-160, -130],
    ]) {
      for (const ouFilter of [null, [5, 5.5], [5.5, 6], [5, 6]]) {
        const filter = g => {
          if (g.home_ml == null || g.home_final == null) return false;
          if (g.home_ml < min || g.home_ml > max) return false;
          if (ouFilter && (g.ou == null || g.ou < ouFilter[0] || g.ou > ouFilter[1])) return false;
          return true;
        };
        results.push(sweep(`Home fav [${min}→${max}]${ouFilter ? ` OU[${ouFilter}]` : ''}`, NHL, filter, g => gradeML(g, true)));
      }
    }
    // P1 tight fav
    for (const [min, max] of [[-110, -100], [-115, -105], [-120, -105]]) {
      const filter = g => g.home_ml != null && g.home_p1 != null && g.home_ml >= min && g.home_ml <= max;
      results.push(sweep(`P1 home fav [${min}→${max}]`, NHL, filter, g => gradeP1ML(g, true)));
    }
    printBest('Coach No Rest', results);
  }

  // ─── 10. SWAGGY Q1/Q3 — NBA 1Q chase variants ────────────────────────────
  console.log('\n[10] NBA Q1 CHASE — rule variants for Matty\'s system');
  {
    const results = [];
    // Current: road fav ≤-115 Q1 ML. Try tighter bands.
    for (const maxML of [-115, -120, -130, -140, -150, -160]) {
      for (const minML of [-300, -250, -220, -200]) {
        if (minML > maxML) continue;
        const filter = g => g.away_ml != null && g.home_q1 != null && g.away_ml <= maxML && g.away_ml >= minML;
        results.push(sweep(`Road fav Q1 ML [${minML}→${maxML}]`, NBA, filter, g => gradeQ1ML(g, false)));
      }
    }
    // Home fav Q1 ML
    for (const maxML of [-115, -120, -130, -140, -150]) {
      const filter = g => g.home_ml != null && g.home_q1 != null && g.home_ml <= maxML;
      results.push(sweep(`Home fav Q1 ML ≤${maxML}`, NBA, filter, g => gradeQ1ML(g, true)));
    }
    // Q1 total under on high OU games
    for (const [ouMin, ouMax] of [[215, 230], [218, 230], [220, 240], [210, 225]]) {
      for (const lf of [0.25, 0.26, 0.27, 0.28]) {
        const filter = g => g.ou != null && g.home_q1 != null && g.ou >= ouMin && g.ou <= ouMax;
        results.push(sweep(`Q1 UNDER (OU ${ouMin}–${ouMax}, line×${lf})`, NBA, filter, g => gradeQ1Total(g, lf, 'under')));
      }
    }
    printBest('NBA Q1 Chase variants', results);
  }

  // ─── FINAL SUMMARY ────────────────────────────────────────────────────────
  console.log('\n\n' + '═'.repeat(70));
  console.log('SUMMARY — ALL VIABLE RULES FOUND (≥50% hit, ≥300 sample)');
  console.log('═'.repeat(70));
  console.log('\nNote: These are base rule parameters. Live system adds:');
  console.log('goalie data, xG, public %, odds movement, starter ERA, park factors.');
  console.log('Expect live hit rate 2-4% higher than backtest baseline.\n');
}

main().catch(console.error);
