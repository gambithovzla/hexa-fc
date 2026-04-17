import pool from './db.js';
import { getMatchById, getTodayMatches } from './soccer-api.js';
import {
  buildDateCandidates,
  findMatchByMatchup,
  getMatchId,
  getMatchStatus,
  settlePickAgainstMatch,
  splitMatchup,
} from './soccer-pick-utils.js';

const LOOKUP_OFFSETS = [0, -1, 1, 2, -2];
const DEFAULT_QUERY_LIMIT = 250;

async function loadMatchesForDate(dateStr, cache) {
  if (cache.has(dateStr)) return cache.get(dateStr);

  try {
    const matches = await getTodayMatches(dateStr);
    cache.set(dateStr, matches);
    return matches;
  } catch (error) {
    console.warn(`[pick-resolver] Failed to load matches for ${dateStr}: ${error?.message ?? error}`);
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

async function applyPickResolution(pickRow, match) {
  const result = settlePickAgainstMatch(pickRow, match);
  if (!result) {
    return { updated: false, reason: 'unsupported_market' };
  }

  const { rows } = await pool.query(
    `UPDATE picks
       SET result = $1
     WHERE id = $2
       AND result = 'pending'
     RETURNING id, result`,
    [result, pickRow.id],
  );

  return {
    updated: rows.length > 0,
    result,
    matchId: getMatchId(match),
  };
}

async function resolvePickRows(pickRows, targetMatch = null) {
  const cache = new Map();
  const summary = {
    scanned: pickRows.length,
    matched: 0,
    resolved: 0,
    unresolved: 0,
    skipped: 0,
    errors: 0,
    updates: [],
  };

  for (const pickRow of pickRows) {
    try {
      const match = targetMatch
        ? findMatchByMatchup(pickRow.matchup, [targetMatch])
        : await findFixtureForPick(pickRow, cache);

      if (!match) {
        summary.unresolved += 1;
        continue;
      }

      summary.matched += 1;

      const status = getMatchStatus(match);
      if (!status.isFinished) {
        summary.skipped += 1;
        continue;
      }

      const resolution = await applyPickResolution(pickRow, match);
      if (!resolution.updated) {
        summary.skipped += 1;
        continue;
      }

      summary.resolved += 1;
      summary.updates.push({
        pickId: pickRow.id,
        result: resolution.result,
        matchId: resolution.matchId,
      });
    } catch (error) {
      summary.errors += 1;
      console.error(`[pick-resolver] Failed to resolve pick ${pickRow?.id}:`, error?.message ?? error);
    }
  }

  return summary;
}

async function queryPendingPicks(limit = DEFAULT_QUERY_LIMIT) {
  const { rows } = await pool.query(
    `SELECT id, matchup, pick, best_pick, created_at
       FROM picks
      WHERE result = 'pending'
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );

  return rows.filter((row) => splitMatchup(row.matchup));
}

export async function resolvePendingPicks() {
  const pendingPicks = await queryPendingPicks();
  if (!pendingPicks.length) {
    return {
      scanned: 0,
      matched: 0,
      resolved: 0,
      unresolved: 0,
      skipped: 0,
      errors: 0,
      updates: [],
    };
  }

  const summary = await resolvePickRows(pendingPicks);
  console.log(
    `[pick-resolver] scanned=${summary.scanned} matched=${summary.matched} resolved=${summary.resolved} `
    + `skipped=${summary.skipped} unresolved=${summary.unresolved} errors=${summary.errors}`,
  );
  return summary;
}

export async function resolveGamePicks(matchId) {
  const match = await getMatchById(matchId);
  if (!match) {
    return {
      scanned: 0,
      matched: 0,
      resolved: 0,
      unresolved: 0,
      skipped: 0,
      errors: 1,
      updates: [],
      error: `Match ${matchId} not found`,
    };
  }

  const status = getMatchStatus(match);
  const pendingPicks = await queryPendingPicks();
  const relevantPicks = pendingPicks.filter((row) => findMatchByMatchup(row.matchup, [match]));

  if (!relevantPicks.length) {
    return {
      scanned: 0,
      matched: 0,
      resolved: 0,
      unresolved: 0,
      skipped: 0,
      errors: 0,
      updates: [],
      matchId: getMatchId(match),
      status: status.short,
    };
  }

  const summary = await resolvePickRows(relevantPicks, match);
  return {
    ...summary,
    matchId: getMatchId(match),
    status: status.short,
  };
}
