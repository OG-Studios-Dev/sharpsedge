"""
SharpsEdge FastAPI server
Endpoints the Next.js dashboard calls.

Run: uvicorn server:app --reload --port 3001
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import sqlite3
import sys, os

# Ensure sibling folders are importable in serverless builds
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "model"))

from pipeline.db import get_conn, init_db
from pipeline import nhl_fetcher, nba_fetcher
from model.engine import analyze_prop, PROP_COLUMNS

app = FastAPI(title="SharpsEdge API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── helpers ──────────────────────────────────────────────────────────────────

def db_rows(query: str, params=()) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def normalize_prop(a: dict) -> dict:
    """Normalize model output to match the Next.js dashboard contract."""
    if not isinstance(a, dict):
        return a

    # recommendation pill
    if "recommendation" not in a:
        direction = a.get("direction") or a.get("recommendation")
        if isinstance(direction, str):
            a["recommendation"] = direction.upper()

    # common fields
    rolling = a.get("rolling") or {}
    splits = a.get("splits") or {}

    if "rolling_avg_5" not in a and isinstance(rolling, dict):
        a["rolling_avg_5"] = rolling.get("l5")
    if "is_back_to_back" not in a:
        a["is_back_to_back"] = a.get("back_to_back", False)
    if "home_avg" not in a and isinstance(splits, dict):
        a["home_avg"] = splits.get("home")
    if "away_avg" not in a and isinstance(splits, dict):
        a["away_avg"] = splits.get("away")

    # chart data
    if "last_5" not in a:
        recent = a.get("recent_games") or []
        if isinstance(recent, list):
            vals = []
            for g in recent[:5]:
                if isinstance(g, dict) and "stat_val" in g:
                    vals.append(g.get("stat_val"))
            a["last_5"] = vals

    # reasoning text
    if "reasoning" not in a:
        a["reasoning"] = a.get("summary", "")

    return a


# ── routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/games")
def list_games(date: str = Query(default=None), sport: str = Query(default=None)):
    """List games for a date. Auto-fetches if not in DB yet."""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    # Trigger live fetch for today/yesterday
    today = datetime.now().strftime("%Y-%m-%d")
    if date >= (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"):
        try:
            if sport in (None, "nhl"):
                nhl_fetcher.run(date)
            if sport in (None, "nba"):
                nba_fetcher.run(date)
        except Exception as e:
            print(f"Fetch error: {e}")

    sport_filter = "AND sport=?" if sport else ""
    params = (date, sport) if sport else (date,)
    games = db_rows(f"""
        SELECT id, sport, game_date, home_team, away_team, status
        FROM games
        WHERE game_date=? {sport_filter}
        ORDER BY sport, home_team
    """, params)
    return {"date": date, "games": games}


@app.get("/api/games/{game_id}")
def get_game(game_id: str):
    """Game detail with players who have enough history to analyze."""
    rows = db_rows("SELECT * FROM games WHERE id=?", (game_id,))
    if not rows:
        raise HTTPException(404, "Game not found")
    game = rows[0]
    sport = game["sport"]

    # Get all players who played in this game
    players = db_rows("""
        SELECT DISTINCT player_id, player_name, team, is_home
        FROM player_game_stats
        WHERE game_id=? AND sport=?
        ORDER BY is_home DESC, player_name
    """, (game_id, sport))

    # For scheduled games, get rosters from recent history
    if not players:
        # Pull from recent games for these teams
        for team in [game["home_team"], game["away_team"]]:
            is_home = 1 if team == game["home_team"] else 0
            recent = db_rows("""
                SELECT DISTINCT player_id, player_name, team, ? as is_home
                FROM player_game_stats
                WHERE sport=? AND team=?
                ORDER BY game_date DESC
                LIMIT 20
            """, (is_home, sport, team))
            players.extend(recent)

    return {"game": game, "players": players}


@app.get("/api/props/{game_id}/{player_id}/{prop_type}")
def get_prop_analysis(
    game_id: str,
    player_id: str,
    prop_type: str,
    line: float = Query(..., description="The prop line (e.g. 0.5 for NHL points)"),
):
    """
    Full prop drill-down for a player/prop_type in a game.
    Returns rolling avgs, splits, streak, B2B, opponent rank, summary.
    """
    game_rows = db_rows("SELECT * FROM games WHERE id=?", (game_id,))
    if not game_rows:
        raise HTTPException(404, "Game not found")
    game = game_rows[0]
    sport = game["sport"]

    # Get player info from DB
    player_rows = db_rows("""
        SELECT player_name, team, is_home
        FROM player_game_stats
        WHERE player_id=? AND sport=?
        ORDER BY game_date DESC LIMIT 1
    """, (player_id, sport))

    if not player_rows:
        raise HTTPException(404, "Player not found")

    p = player_rows[0]
    is_home = bool(p["is_home"])
    opponent = game["away_team"] if is_home else game["home_team"]

    analysis = analyze_prop(
        player_id=player_id,
        player_name=p["player_name"],
        sport=sport,
        prop_type=prop_type,
        line=line,
        game_date=game["game_date"],
        is_home=is_home,
        opponent=opponent,
    )

    if "error" in analysis:
        raise HTTPException(422, analysis["error"])

    return normalize_prop(analysis)


@app.get("/api/props/{game_id}")
def get_all_props_for_game(game_id: str):
    """
    Return all analyzable props for every player in a game.
    Uses default lines (can be updated with real lines later).
    """
    game_rows = db_rows("SELECT * FROM games WHERE id=?", (game_id,))
    if not game_rows:
        raise HTTPException(404, "Game not found")
    game = game_rows[0]
    sport = game["sport"]

    DEFAULT_LINES = {
        "nhl": {"points": 0.5, "goals": 0.5, "assists": 0.5, "shots": 2.5},
        "nba": {"points": 20.5, "rebounds": 7.5, "assists": 5.5, "steals": 1.5, "blocks": 1.5},
    }

    players = db_rows("""
        SELECT DISTINCT player_id, player_name, team, is_home
        FROM player_game_stats
        WHERE game_id=? AND sport=?
        ORDER BY is_home DESC, player_name
    """, (game_id, sport))

    if not players:
        # Scheduled — pull from roster history
        for team in [game["home_team"], game["away_team"]]:
            is_home = 1 if team == game["home_team"] else 0
            recent = db_rows("""
                SELECT DISTINCT player_id, player_name, team, ? as is_home
                FROM player_game_stats
                WHERE sport=? AND team=?
                  AND game_date >= date('now', '-30 days')
                GROUP BY player_id
                ORDER BY game_date DESC
                LIMIT 15
            """, (is_home, sport, team))
            players.extend(recent)

    results = []
    prop_types = list(PROP_COLUMNS.get(sport, {}).keys())
    lines = DEFAULT_LINES.get(sport, {})

    conn = get_conn()
    for p in players:
        for prop_type in prop_types:
            line = lines.get(prop_type, 1.5)
            opponent = game["away_team"] if p["is_home"] else game["home_team"]
            analysis = analyze_prop(
                player_id=p["player_id"],
                player_name=p["player_name"],
                sport=sport,
                prop_type=prop_type,
                line=line,
                game_date=game["game_date"],
                is_home=bool(p["is_home"]),
                opponent=opponent,
                conn=conn,
            )
            if "error" not in analysis:
                analysis["game_id"] = game_id
                results.append(normalize_prop(analysis))

    conn.close()
    results.sort(key=lambda x: x["confidence"], reverse=True)
    return {"game": game, "props": results}


@app.get("/api/players/{player_id}/history")
def player_history(player_id: str, sport: str = Query(...), limit: int = Query(default=20)):
    """Raw game log for a player."""
    rows = db_rows("""
        SELECT pgs.game_date, pgs.team, pgs.is_home,
               g.home_team, g.away_team,
               pgs.goals, pgs.assists, pgs.points, pgs.shots, pgs.toi,
               pgs.pts, pgs.reb, pgs.ast, pgs.stl, pgs.blk, pgs.minutes
        FROM player_game_stats pgs
        JOIN games g ON g.id = pgs.game_id
        WHERE pgs.player_id=? AND pgs.sport=?
        ORDER BY pgs.game_date DESC
        LIMIT ?
    """, (player_id, sport, limit))
    return {"player_id": player_id, "sport": sport, "history": rows}


class PickCreate(BaseModel):
    pick_date: str
    sport: str
    player_name: str
    player_id: str
    team: str
    prop_type: str
    recommendation: str
    line: float
    confidence: float
    # optional
    game_id: Optional[str] = None


@app.post("/api/picks")
def create_pick(pick: PickCreate):
    """Persist a pick (used by the dashboard 'Save pick' buttons)."""
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO picks (pick_date, sport, player_name, player_id, team, prop_type,
                           direction, line, model_projection, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            pick.pick_date,
            pick.sport,
            pick.player_name,
            pick.player_id,
            pick.team,
            pick.prop_type,
            pick.recommendation.lower(),
            float(pick.line),
            0.0,
            float(pick.confidence),
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}


@app.get("/api/picks")
def list_picks(date: str = Query(default=None), sport: str = Query(default=None)):
    """Saved picks with results."""
    filters = []
    params = []
    if date:
        filters.append("pick_date=?")
        params.append(date)
    if sport:
        filters.append("sport=?")
        params.append(sport)
    where = "WHERE " + " AND ".join(filters) if filters else ""
    rows = db_rows(f"SELECT * FROM picks {where} ORDER BY confidence DESC", params)
    return {"picks": rows}


@app.get("/api/pnl")
def pnl_summary():
    """P&L summary across all picks."""
    rows = db_rows("""
        SELECT sport,
               COUNT(*) as total,
               SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) as losses,
               SUM(CASE WHEN result='push' THEN 1 ELSE 0 END) as pushes,
               SUM(COALESCE(pnl, 0)) as total_pnl
        FROM picks
        WHERE result IS NOT NULL
        GROUP BY sport
    """)
    overall = db_rows("""
        SELECT COUNT(*) as total,
               SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) as losses,
               SUM(COALESCE(pnl, 0)) as total_pnl
        FROM picks WHERE result IS NOT NULL
    """)
    return {"by_sport": rows, "overall": overall[0] if overall else {}}


if __name__ == "__main__":
    import uvicorn
    init_db()
    uvicorn.run("server:app", host="0.0.0.0", port=3001, reload=True)
