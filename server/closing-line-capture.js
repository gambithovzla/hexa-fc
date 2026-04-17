import pool from './db.js';
import { calculateImpliedProbability, getOdds, matchOddsToGame } from './odds-api.js';
import { getTodayMatches } from './soccer-api.js';
import {
  buildDateCandidates,
  findMatchByMatchup,
  getMatchId,
  getMatchStatus,
  isKickoffWithinMinutes,
  resolveOddsForPick,
  safeJsonParse,
  splitMatchup,
} from './soccer-pick-utils.js';

const LOOKUP_OFFSETS = [0, -1, 1, 2];
const CAPTURE_BEFORE_KICKOFF_MINUTES = 45;
const CAPTURE_AFTER_KICKOFF_MINUTES = 180;

async function loadMatchesForDate(dateStr, cache) {
  if (cache.has(dateStr)) return cache.get(dateStr);

  try {
    const matches = await getTodayMatches(dateStr);
    cache.set(dateStr, matches);
    return matches;
  } catch (error) {
    console.warn(`[closing-line] Failed to load matches for ${dateStr}: ${error?.message ?? error}`);
    cache.set(dateStr, []);
    return [];
  }
}

function getLookupDates(pickRow) {
  const createdAtDates = buildDateCandidates(pickRow?.created_at, LOOKUP_OFFSETS);
  const todayDates = buildDateCandidates(new Date(), [0, -1, 1]);
  return [...new Set([...createdAtDates, ...todayDates])];
}

async function findFixtureForPick(pickRow, cache) {
  if (!splitMatchup(pickRow?.matchup)) return null;

  for (const dateStr of getLookupDates(pickRow)) {
    const matches = await loadMatchesForDate(dateStr, cache);
    const match = findMatchByMatchup(pickRow.matchup, matches);
    if (match) return match;
  }

  return null;
}

function shouldCaptureMatch(match) {
  const status = getMatchStatus(match);
  return (
    status.isLive ||
    status.isFinished ||
    isKickoffWithinMinutes(match, CAPTURE_BEFORE_KICKOFF_MINUTES, CAPTURE_AFTER_KICKOFF_MINUTES)
  );
}

async function loadOddsForLeague(leagueId, cache) {
  if (cache.has(leagueId)) return cache.get(leagueId);

  try {
    const odds = await getOdds(leagueId);
    cache.set(leagueId, odds);
    return odds;
  } catch (error) {
    console.warn(`[closing-line] Failed to load odds for league ${leagueId}: ${error?.message ?? error}`);
    cache.set(leagueId, []);
    return [];
  }
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export async function captureClosingLines() {
  const { rows } = await pool.query(
    `SELECT id, matchup, pick, best_pick, created_at, implied_prob_at_pick
       FROM picks
      WHERE result = 'pending'
        AND closing_odds IS NULL
      ORDER BY created_at DESC
      LIMIT 250`,
  );

  const candidatePicks = rows.filter((row) => splitMatchup(row.matchup));
  if (!candidatePicks.length) {
    return { scanned: 0, matched: 0, captured: 0, skipped: 0, errors: 0, updates: [] };
  }

  const matchesCache = new Map();
  const oddsCache = new Map();
  const summary = {
    scanned: candidatePicks.length,
    matched: 0,
    captured: 0,
    skipped: 0,
    errors: 0,
    updates: [],
  };

  for (const pickRow of candidatePicks) {
    try {
      const match = await findFixtureForPick(pickRow, matchesCache);
      if (!match) {
        summary.skipped += 1;
        continue;
      }

      summary.matched += 1;

      if (!shouldCaptureMatch(match)) {
        summary.skipped += 1;
        continue;
      }

      const leagueId = Number(match?.competition?.id ?? match?.league?.id);
      if (!Number.isFinite(leagueId)) {
        summary.skipped += 1;
        continue;
      }

      const allOdds = await loadOddsForLeague(leagueId, oddsCache);
      const matchedOdds = matchOddsToGame(
        allOdds,
        match?.homeTeam?.name ?? match?.teams?.home?.name,
        match?.awayTeam?.name ?? match?.teams?.away?.name,
      );

      if (!matchedOdds) {
        summary.skipped += 1;
        continue;
      }

      const bestPick = safeJsonParse(pickRow.best_pick, {}) ?? {};
      const closingOdds = resolveOddsForPick({
        pick: pickRow.pick,
        bestPick,
        odds: matchedOdds,
        matchup: pickRow.matchup,
        match,
      });

      if (!Number.isFinite(Number(closingOdds))) {
        summary.skipped += 1;
        continue;
      }

      const impliedClosing = calculateImpliedProbability(closingOdds);
      const impliedAtPick = Number(pickRow.implied_prob_at_pick);
      const clv = Number.isFinite(impliedClosing) && Number.isFinite(impliedAtPick)
        ? round2(impliedClosing - impliedAtPick)
        : null;

      const { rows: updatedRows } = await pool.query(
        `UPDATE picks
            SET closing_odds = $1,
                implied_prob_closing = $2,
                clv = $3
          WHERE id = $4
            AND closing_odds IS NULL
        RETURNING id`,
        [closingOdds, impliedClosing, clv, pickRow.id],
      );

      if (!updatedRows.length) {
        summary.skipped += 1;
        continue;
      }

      summary.captured += 1;
      summary.updates.push({
        pickId: pickRow.id,
        matchId: getMatchId(match),
        closingOdds,
        clv,
      });
    } catch (error) {
      summary.errors += 1;
      console.error(`[closing-line] Failed for pick ${pickRow?.id}:`, error?.message ?? error);
    }
  }

  console.log(
    `[closing-line] scanned=${summary.scanned} matched=${summary.matched} captured=${summary.captured} `
    + `skipped=${summary.skipped} errors=${summary.errors}`,
  );
  return summary;
}
