import pool from './db.js';
import { getMatchById, getMatchEvents, getTodayMatches } from './soccer-api.js';
import {
  buildDateCandidates,
  buildLiveProgress,
  findMatchByMatchup,
  getMatchId,
  getMatchKickoff,
  getMatchMinute,
  getMatchStatus,
  getMatchupFromMatch,
  isKickoffWithinMinutes,
  splitMatchup,
} from './soccer-pick-utils.js';

const PICK_LOOKUP_OFFSETS = [0, -1, 1, 2, -2];

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function toLiveCard(match, events = []) {
  const status = getMatchStatus(match);
  const kickoff = getMatchKickoff(match);
  const minute = getMatchMinute(match);
  const recentEvents = [...events]
    .sort((a, b) => (b.minute ?? -1) - (a.minute ?? -1))
    .slice(0, 6);

  return {
    matchId: getMatchId(match),
    gamePk: getMatchId(match),
    matchup: getMatchupFromMatch(match),
    kickoff: kickoff?.toISOString() ?? null,
    minute,
    status: status.isFinished ? 'final' : status.isLive ? 'live' : 'scheduled',
    statusShort: status.short,
    statusLong: status.long,
    competition: {
      id: match?.competition?.id ?? match?.league?.id ?? null,
      name: match?.competition?.name ?? match?.league?.name ?? null,
      shortName: match?.competition?.shortName ?? null,
      country: match?.competition?.country ?? match?.league?.country ?? null,
    },
    home: {
      id: match?.homeTeam?.id ?? match?.teams?.home?.id ?? null,
      name: match?.homeTeam?.name ?? match?.teams?.home?.name ?? 'Home',
      abbreviation: match?.homeTeam?.shortName ?? match?.teams?.home?.abbreviation ?? 'HOM',
      logo: match?.homeTeam?.logo ?? match?.teams?.home?.logo ?? null,
      score: match?.score?.home ?? match?.goals?.home ?? 0,
    },
    away: {
      id: match?.awayTeam?.id ?? match?.teams?.away?.id ?? null,
      name: match?.awayTeam?.name ?? match?.teams?.away?.name ?? 'Away',
      abbreviation: match?.awayTeam?.shortName ?? match?.teams?.away?.abbreviation ?? 'AWY',
      logo: match?.awayTeam?.logo ?? match?.teams?.away?.logo ?? null,
      score: match?.score?.away ?? match?.goals?.away ?? 0,
    },
    events: recentEvents,
  };
}

function compareLiveCards(a, b) {
  const statusWeight = { live: 0, scheduled: 1, final: 2 };
  const statusDiff = (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9);
  if (statusDiff !== 0) return statusDiff;

  const kickoffA = a.kickoff ? new Date(a.kickoff).getTime() : Number.MAX_SAFE_INTEGER;
  const kickoffB = b.kickoff ? new Date(b.kickoff).getTime() : Number.MAX_SAFE_INTEGER;
  return kickoffA - kickoffB;
}

async function loadMatchesForDate(dateStr, cache) {
  if (cache.has(dateStr)) return cache.get(dateStr);

  try {
    const matches = await getTodayMatches(dateStr);
    cache.set(dateStr, matches);
    return matches;
  } catch (error) {
    console.warn(`[soccer-live] Failed to load matches for ${dateStr}: ${error?.message ?? error}`);
    cache.set(dateStr, []);
    return [];
  }
}

function getLookupDates(pickRow) {
  return dedupe([
    ...buildDateCandidates(pickRow?.created_at, PICK_LOOKUP_OFFSETS),
    ...buildDateCandidates(new Date(), [0, -1, 1]),
  ]);
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

export async function getLiveMatches(matchIds = null) {
  const ids = Array.isArray(matchIds) && matchIds.length
    ? dedupe(matchIds.map((value) => String(value)))
    : [];

  let matches = [];

  if (ids.length) {
    const fetched = await Promise.all(ids.map((id) => getMatchById(id)));
    matches = fetched.filter(Boolean);
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const todayMatches = await getTodayMatches(today);
    matches = todayMatches.filter((match) => {
      const status = getMatchStatus(match);
      return status.isLive || isKickoffWithinMinutes(match, 180, 240);
    });
  }

  const cards = await Promise.all(
    matches.map(async (match) => {
      const fixtureId = getMatchId(match);
      const events = fixtureId ? await getMatchEvents(fixtureId).catch(() => []) : [];
      return toLiveCard(match, events);
    }),
  );

  return cards.sort(compareLiveCards);
}

export async function buildUserLivePickProgress(userId) {
  const { rows } = await pool.query(
    `SELECT id, matchup, pick, best_pick, result, created_at
       FROM picks
      WHERE user_id = $1
        AND result = 'pending'
      ORDER BY created_at DESC
      LIMIT 100`,
    [userId],
  );

  const candidates = rows.filter((row) => splitMatchup(row.matchup));
  if (!candidates.length) return [];

  const matchesCache = new Map();
  const progressItems = [];

  for (const pickRow of candidates) {
    try {
      const match = await findFixtureForPick(pickRow, matchesCache);
      if (!match) continue;

      const kickoff = getMatchKickoff(match);
      const hoursFromKickoff = kickoff ? Math.abs((kickoff.getTime() - Date.now()) / 3600000) : null;
      const status = getMatchStatus(match);

      if (!status.isLive && !status.isFinished && !(hoursFromKickoff != null && hoursFromKickoff <= 8)) {
        continue;
      }

      progressItems.push(buildLiveProgress(pickRow, match));
    } catch (error) {
      console.warn(`[soccer-live] Failed to build progress for pick ${pickRow?.id}: ${error?.message ?? error}`);
    }
  }

  return progressItems.sort((a, b) => {
    const minuteA = a.minute ?? -1;
    const minuteB = b.minute ?? -1;
    return minuteB - minuteA;
  });
}

export async function runFixtureDrivenMaintenance({
  captureOddsSnapshot,
  captureClosingLines,
  resolvePendingPicks,
}) {
  const dateWindow = dedupe(buildDateCandidates(new Date(), [-1, 0, 1]));
  const matchGroups = await Promise.all(dateWindow.map((dateStr) => getTodayMatches(dateStr).catch(() => [])));
  const fixtures = matchGroups.flat();

  if (!fixtures.length) {
    console.log('[scheduler] No fixtures found in the current date window');
    return;
  }

  const liveFixtures = fixtures.filter((match) => getMatchStatus(match).isLive);
  const finalFixtures = fixtures.filter((match) => getMatchStatus(match).isFinished);
  const snapshotWindowFixtures = fixtures.filter((match) => isKickoffWithinMinutes(match, 180, 15));
  const closingWindowFixtures = fixtures.filter((match) => isKickoffWithinMinutes(match, 45, 180));

  console.log(
    `[scheduler] fixtures=${fixtures.length} live=${liveFixtures.length} final=${finalFixtures.length} `
    + `snapshotWindow=${snapshotWindowFixtures.length} closingWindow=${closingWindowFixtures.length}`,
  );

  if (snapshotWindowFixtures.length > 0) {
    await captureOddsSnapshot();
  }

  if (closingWindowFixtures.length > 0 || liveFixtures.length > 0) {
    await captureClosingLines();
  }

  if (finalFixtures.length > 0) {
    await resolvePendingPicks();
  }
}
