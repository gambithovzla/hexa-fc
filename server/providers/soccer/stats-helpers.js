function toNumber(value) {
  if (value == null || value === '') return null;
  const normalized = typeof value === 'string' ? value.replace('%', '').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFinishedFixture(fixture) {
  const status = String(fixture?.fixture?.status?.short ?? '').toUpperCase();
  return ['FT', 'AET', 'PEN', 'WO', 'AWD'].includes(status);
}

function getFixtureGoalsForTeam(fixture, teamId) {
  const isHome = String(fixture?.teams?.home?.id) === String(teamId);
  return {
    isHome,
    goalsFor: isHome ? fixture?.goals?.home ?? null : fixture?.goals?.away ?? null,
    goalsAgainst: isHome ? fixture?.goals?.away ?? null : fixture?.goals?.home ?? null,
  };
}

function getResultCode(fixture, teamId) {
  const { goalsFor, goalsAgainst } = getFixtureGoalsForTeam(fixture, teamId);
  if (goalsFor == null || goalsAgainst == null) return 'D';
  if (goalsFor > goalsAgainst) return 'W';
  if (goalsFor < goalsAgainst) return 'L';
  return 'D';
}

function createFormSnapshot() {
  return {
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };
}

function accumulateFixture(snapshot, fixture, teamId) {
  const { goalsFor, goalsAgainst } = getFixtureGoalsForTeam(fixture, teamId);
  const result = getResultCode(fixture, teamId);

  snapshot.matchesPlayed += 1;
  snapshot.goalsFor += goalsFor ?? 0;
  snapshot.goalsAgainst += goalsAgainst ?? 0;

  if (result === 'W') snapshot.wins += 1;
  else if (result === 'L') snapshot.losses += 1;
  else snapshot.draws += 1;

  return snapshot;
}

function average(values) {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function getStatisticValue(statistics, type) {
  const entry = Array.isArray(statistics)
    ? statistics.find((item) => item?.type === type)
    : null;
  return toNumber(entry?.value);
}

export function buildSeasonCandidates(preferredSeason) {
  const currentYear = new Date().getUTCFullYear();
  const candidates = [
    preferredSeason,
    currentYear - 1,
    currentYear - 2,
    2024,
  ]
    .map((value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value) => value != null);

  return [...new Set(candidates)];
}

export function getRecentCompletedFixtures(fixtures, teamId, limit = 5) {
  return [...fixtures]
    .filter(isFinishedFixture)
    .sort((a, b) => new Date(b?.fixture?.date ?? 0).getTime() - new Date(a?.fixture?.date ?? 0).getTime())
    .slice(0, limit)
    .map((fixture) => ({
      fixture,
      result: getResultCode(fixture, teamId),
    }));
}

export function getVenueForm(fixtures, teamId, venueSide) {
  const filteredFixtures = fixtures.filter((fixture) => {
    if (!isFinishedFixture(fixture)) return false;

    const isHome = String(fixture?.teams?.home?.id) === String(teamId);
    return venueSide === 'home' ? isHome : !isHome;
  });

  return filteredFixtures.reduce(
    (snapshot, fixture) => accumulateFixture(snapshot, fixture, teamId),
    createFormSnapshot(),
  );
}

export function summarizeRecentTeamMetrics(recentFixturesWithStats, teamId) {
  const shotForValues = [];
  const shotAgainstValues = [];
  const shotOnTargetForValues = [];
  const shotOnTargetAgainstValues = [];
  const xgForValues = [];
  const xgaValues = [];

  for (const item of recentFixturesWithStats) {
    const fixtureStats = Array.isArray(item?.statistics) ? item.statistics : [];
    if (fixtureStats.length === 0) continue;

    const teamStats = fixtureStats.find((entry) => String(entry?.team?.id) === String(teamId));
    const opponentStats = fixtureStats.find((entry) => String(entry?.team?.id) !== String(teamId));
    if (!teamStats || !opponentStats) continue;

    const totalShotsFor = getStatisticValue(teamStats.statistics, 'Total Shots');
    const totalShotsAgainst = getStatisticValue(opponentStats.statistics, 'Total Shots');
    const shotsOnGoalFor = getStatisticValue(teamStats.statistics, 'Shots on Goal');
    const shotsOnGoalAgainst = getStatisticValue(opponentStats.statistics, 'Shots on Goal');
    const expectedGoalsFor = getStatisticValue(teamStats.statistics, 'expected_goals');
    const expectedGoalsAgainst = getStatisticValue(opponentStats.statistics, 'expected_goals');

    if (totalShotsFor != null) shotForValues.push(totalShotsFor);
    if (totalShotsAgainst != null) shotAgainstValues.push(totalShotsAgainst);
    if (shotsOnGoalFor != null) shotOnTargetForValues.push(shotsOnGoalFor);
    if (shotsOnGoalAgainst != null) shotOnTargetAgainstValues.push(shotsOnGoalAgainst);
    if (expectedGoalsFor != null) xgForValues.push(expectedGoalsFor);
    if (expectedGoalsAgainst != null) xgaValues.push(expectedGoalsAgainst);
  }

  return {
    shots: {
      for: average(shotForValues),
      against: average(shotAgainstValues),
      sampleSize: Math.max(shotForValues.length, shotAgainstValues.length),
    },
    shotsOnTarget: {
      for: average(shotOnTargetForValues),
      against: average(shotOnTargetAgainstValues),
      sampleSize: Math.max(shotOnTargetForValues.length, shotOnTargetAgainstValues.length),
    },
    xg: average(xgForValues),
    xga: average(xgaValues),
    fixtureStatsSampleSize: Math.max(xgForValues.length, xgaValues.length, shotForValues.length, shotAgainstValues.length),
  };
}

export function buildNormalizedTeamStats({
  apiStats,
  recentFixtures,
  recentMetrics,
  teamId,
  leagueId,
  season,
}) {
  const fixtures = apiStats?.fixtures ?? {};
  const goalsFor = apiStats?.goals?.for?.total?.total ?? 0;
  const goalsAgainst = apiStats?.goals?.against?.total?.total ?? 0;

  return {
    source: 'api-sports',
    teamId: apiStats?.team?.id ?? teamId ?? null,
    leagueId: apiStats?.league?.id ?? leagueId ?? null,
    season: apiStats?.league?.season ?? season ?? null,
    teamName: apiStats?.team?.name ?? null,
    teamShortName: apiStats?.team?.name ? apiStats.team.name.slice(0, 3).toUpperCase() : null,
    teamLogo: apiStats?.team?.logo ?? null,
    matchesPlayed: fixtures?.played?.total ?? 0,
    wins: fixtures?.wins?.total ?? 0,
    draws: fixtures?.draws?.total ?? 0,
    losses: fixtures?.loses?.total ?? 0,
    goalsFor,
    goalsAgainst,
    formLast5: recentFixtures.map((item) => item.result).join(''),
    homeForm: {
      matchesPlayed: fixtures?.played?.home ?? 0,
      wins: fixtures?.wins?.home ?? 0,
      draws: fixtures?.draws?.home ?? 0,
      losses: fixtures?.loses?.home ?? 0,
      goalsFor: apiStats?.goals?.for?.total?.home ?? 0,
      goalsAgainst: apiStats?.goals?.against?.total?.home ?? 0,
    },
    awayForm: {
      matchesPlayed: fixtures?.played?.away ?? 0,
      wins: fixtures?.wins?.away ?? 0,
      draws: fixtures?.draws?.away ?? 0,
      losses: fixtures?.loses?.away ?? 0,
      goalsFor: apiStats?.goals?.for?.total?.away ?? 0,
      goalsAgainst: apiStats?.goals?.against?.total?.away ?? 0,
    },
    shots: recentMetrics.shots,
    shotsOnTarget: recentMetrics.shotsOnTarget,
    xg: recentMetrics.xg,
    xga: recentMetrics.xga,
    sourceMeta: {
      upstream: 'api-sports',
      recentFixturesCount: recentFixtures.length,
      fixtureStatsSampleSize: recentMetrics.fixtureStatsSampleSize,
      formSource: recentFixtures.length > 0 ? 'recent-fixtures' : 'api-stats-form',
    },
  };
}
