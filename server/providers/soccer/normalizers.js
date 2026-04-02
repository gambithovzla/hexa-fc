const DEFAULT_COMPETITION = {
  id: null,
  name: null,
  shortName: null,
  country: null,
};

const DEFAULT_VENUE = {
  id: null,
  name: null,
  city: null,
};

function toStatusShort(rawShort, rawLong) {
  const explicitShort = String(rawShort ?? '').trim().toUpperCase();
  if (explicitShort) return explicitShort;

  const longStatus = String(rawLong ?? '').trim().toLowerCase();
  if (!longStatus || longStatus === 'not started') return 'NS';
  if (longStatus.includes('half') || longStatus.includes('live') || longStatus.includes('progress')) return 'LIVE';
  if (longStatus.includes('finished') || longStatus.includes('full time')) return 'FT';
  return 'NS';
}

function isLiveStatus(statusShort) {
  const liveStatuses = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT']);
  return liveStatuses.has(statusShort);
}

function isFinishedStatus(statusShort) {
  const finishedStatuses = new Set(['FT', 'AET', 'PEN', 'WO', 'AWD']);
  return finishedStatuses.has(statusShort);
}

function toShortName(name) {
  const safeName = String(name ?? '').trim();
  if (!safeName) return null;

  const tokens = safeName
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);

  if (tokens.length >= 2) {
    return tokens
      .slice(0, 3)
      .map((token) => token[0]?.toUpperCase() ?? '')
      .join('');
  }

  return safeName.slice(0, 3).toUpperCase();
}

function toLegacyTeam(team) {
  return {
    id: team.id,
    name: team.name,
    abbreviation: team.shortName,
    logo: team.logo,
    // Some older consumers still expect this nested shape.
    team: {
      id: team.id,
      name: team.name,
      abbreviation: team.shortName,
      logo: team.logo,
    },
  };
}

function warnIfIncomplete(sourceLabel, rawMatch, normalizedMatch) {
  const missingFields = [];

  if (normalizedMatch.matchId == null) missingFields.push('matchId');
  if (!normalizedMatch.date) missingFields.push('date');
  if (!normalizedMatch.homeTeam.name) missingFields.push('homeTeamName');
  if (!normalizedMatch.awayTeam.name) missingFields.push('awayTeamName');

  if (missingFields.length === 0) return;

  const fallbackId = rawMatch?.fixture?.id ?? normalizedMatch.matchId ?? 'unknown';
  console.warn(`[soccer-provider] Incomplete ${sourceLabel} match ${fallbackId}: missing ${missingFields.join(', ')}`);
}

function toHybridMatch(normalizedMatch, rawMatch) {
  return {
    ...normalizedMatch,

    // Transitional compatibility aliases for the existing app.
    id: normalizedMatch.matchId,
    gamePk: normalizedMatch.matchId,
    gameDate: normalizedMatch.date,
    lineupStatus: rawMatch?.lineupStatus ?? 'unavailable',

    fixture: {
      id: normalizedMatch.matchId,
      date: normalizedMatch.date,
      status: {
        short: normalizedMatch.status.short,
        long: normalizedMatch.status.long,
      },
      venue: {
        id: normalizedMatch.venue.id,
        name: normalizedMatch.venue.name,
        city: normalizedMatch.venue.city,
      },
    },
    league: {
      id: normalizedMatch.competition.id,
      name: normalizedMatch.competition.name,
      country: normalizedMatch.competition.country,
      season: normalizedMatch.season,
    },
    teams: {
      home: toLegacyTeam(normalizedMatch.homeTeam),
      away: toLegacyTeam(normalizedMatch.awayTeam),
    },
    goals: {
      home: normalizedMatch.score.home,
      away: normalizedMatch.score.away,
    },
  };
}

/**
 * Converts the current mock payload into the H.E.X.A. F.C. internal model while
 * keeping temporary legacy aliases for existing consumers.
 *
 * @param {Object} rawMatch
 * @returns {Object}
 */
export function normalizeMockMatch(rawMatch) {
  const matchId = rawMatch?.fixture?.id ?? rawMatch?.id ?? null;
  const date = rawMatch?.fixture?.date ?? rawMatch?.gameDate ?? null;
  const statusShort = toStatusShort(rawMatch?.fixture?.status?.short, rawMatch?.fixture?.status?.long);
  const statusLong = rawMatch?.fixture?.status?.long ?? 'Not Started';

  const homeTeam = {
    id: rawMatch?.teams?.home?.id ?? null,
    name: rawMatch?.teams?.home?.name ?? '',
    shortName: rawMatch?.teams?.home?.abbreviation ?? toShortName(rawMatch?.teams?.home?.name),
    logo: rawMatch?.teams?.home?.logo ?? null,
  };

  const awayTeam = {
    id: rawMatch?.teams?.away?.id ?? null,
    name: rawMatch?.teams?.away?.name ?? '',
    shortName: rawMatch?.teams?.away?.abbreviation ?? toShortName(rawMatch?.teams?.away?.name),
    logo: rawMatch?.teams?.away?.logo ?? null,
  };

  const normalizedMatch = {
    matchId,
    source: 'mock',
    competition: {
      ...DEFAULT_COMPETITION,
      id: rawMatch?.league?.id ?? null,
      name: rawMatch?.league?.name ?? null,
      shortName: rawMatch?.league?.shortName ?? rawMatch?.league?.name ?? null,
      country: rawMatch?.league?.country ?? null,
    },
    season: rawMatch?.league?.season ?? rawMatch?.season ?? null,
    date,
    status: {
      short: statusShort,
      long: statusLong,
      phase: rawMatch?.fixture?.status?.phase ?? null,
      isLive: isLiveStatus(statusShort),
      isFinished: isFinishedStatus(statusShort),
    },
    venue: {
      ...DEFAULT_VENUE,
      id: rawMatch?.fixture?.venue?.id ?? null,
      name: rawMatch?.fixture?.venue?.name ?? null,
      city: rawMatch?.fixture?.venue?.city ?? null,
    },
    homeTeam,
    awayTeam,
    score: {
      home: rawMatch?.goals?.home ?? null,
      away: rawMatch?.goals?.away ?? null,
    },
    metrics: {
      home: {},
      away: {},
    },
    context: {},
    odds: {},
    sourceMeta: {
      provider: 'mock',
    },
  };

  warnIfIncomplete('mock', rawMatch, normalizedMatch);

  return toHybridMatch(normalizedMatch, rawMatch);
}

/**
 * Converts an API-Sports fixture into the same H.E.X.A. hybrid match shape.
 *
 * @param {Object} rawMatch
 * @returns {Object}
 */
export function normalizeApiSportsMatch(rawMatch) {
  const matchId = rawMatch?.fixture?.id ?? rawMatch?.id ?? null;
  const date = rawMatch?.fixture?.date ?? null;
  const statusShort = toStatusShort(rawMatch?.fixture?.status?.short, rawMatch?.fixture?.status?.long);
  const statusLong = rawMatch?.fixture?.status?.long ?? 'Not Started';

  const homeTeam = {
    id: rawMatch?.teams?.home?.id ?? null,
    name: rawMatch?.teams?.home?.name ?? '',
    shortName: rawMatch?.teams?.home?.abbreviation ?? toShortName(rawMatch?.teams?.home?.name),
    logo: rawMatch?.teams?.home?.logo ?? null,
  };

  const awayTeam = {
    id: rawMatch?.teams?.away?.id ?? null,
    name: rawMatch?.teams?.away?.name ?? '',
    shortName: rawMatch?.teams?.away?.abbreviation ?? toShortName(rawMatch?.teams?.away?.name),
    logo: rawMatch?.teams?.away?.logo ?? null,
  };

  const normalizedMatch = {
    matchId,
    source: 'api-sports',
    competition: {
      ...DEFAULT_COMPETITION,
      id: rawMatch?.league?.id ?? null,
      name: rawMatch?.league?.name ?? null,
      shortName: rawMatch?.league?.round ?? rawMatch?.league?.name ?? null,
      country: rawMatch?.league?.country ?? null,
    },
    season: rawMatch?.league?.season ?? null,
    date,
    status: {
      short: statusShort,
      long: statusLong,
      phase: rawMatch?.fixture?.status?.elapsed != null ? String(rawMatch.fixture.status.elapsed) : null,
      isLive: isLiveStatus(statusShort),
      isFinished: isFinishedStatus(statusShort),
    },
    venue: {
      ...DEFAULT_VENUE,
      id: rawMatch?.fixture?.venue?.id ?? null,
      name: rawMatch?.fixture?.venue?.name ?? null,
      city: rawMatch?.fixture?.venue?.city ?? null,
    },
    homeTeam,
    awayTeam,
    score: {
      home: rawMatch?.goals?.home ?? null,
      away: rawMatch?.goals?.away ?? null,
    },
    metrics: {
      home: {},
      away: {},
    },
    context: {},
    odds: {},
    sourceMeta: {
      provider: 'real',
      upstream: 'api-sports',
      rawLeagueId: rawMatch?.league?.id ?? null,
      rawStatusShort: rawMatch?.fixture?.status?.short ?? null,
    },
  };

  warnIfIncomplete('api-sports', rawMatch, normalizedMatch);

  return toHybridMatch(normalizedMatch, rawMatch);
}
