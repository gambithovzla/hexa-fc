import { getTeamStats } from './soccer-api.js';

function toValue(value, fallback = null) {
  return value == null || value === '' ? fallback : value;
}

function formatValue(value, fallback = 'N/A') {
  return value == null || value === '' ? fallback : String(value);
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateImpliedProbability(price) {
  const odds = Number(price);
  if (!Number.isFinite(odds) || odds === 0) return null;

  const probability = odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);

  return Math.round(probability * 1000) / 10;
}

function formatOddsValue(price) {
  if (price == null || price === '') return 'N/A';

  const implied = calculateImpliedProbability(price);
  return implied == null
    ? String(price)
    : `${price} (Implied: ${implied}%)`;
}

function resolveMatchMeta(match) {
  return {
    matchId: match?.matchId ?? match?.fixture?.id ?? match?.gamePk ?? match?.id ?? null,
    source: match?.source ?? 'unknown',
    date: match?.date ?? match?.fixture?.date ?? match?.gameDate ?? null,
    statusShort: match?.status?.short ?? match?.fixture?.status?.short ?? 'NS',
    statusLong: match?.status?.long ?? match?.fixture?.status?.long ?? 'Unknown',
    leagueId: match?.competition?.id ?? match?.league?.id ?? null,
    leagueName: match?.competition?.name ?? match?.league?.name ?? 'European League',
    season: match?.season ?? match?.league?.season ?? null,
    venueName: match?.venue?.name ?? match?.fixture?.venue?.name ?? 'Unknown Stadium',
  };
}

function resolveTeam(match, side) {
  const normalizedTeam = side === 'home' ? match?.homeTeam : match?.awayTeam;
  const legacyTeam = match?.teams?.[side];

  return {
    id: normalizedTeam?.id ?? legacyTeam?.id ?? legacyTeam?.team?.id ?? null,
    name: normalizedTeam?.name ?? legacyTeam?.name ?? legacyTeam?.team?.name ?? (side === 'home' ? 'Home Team' : 'Away Team'),
    shortName: normalizedTeam?.shortName ?? legacyTeam?.abbreviation ?? legacyTeam?.team?.abbreviation ?? null,
    logo: normalizedTeam?.logo ?? legacyTeam?.logo ?? legacyTeam?.team?.logo ?? null,
  };
}

function formatRecord(stats) {
  if (!stats) return 'N/A';
  return `${stats.wins}-${stats.draws}-${stats.losses}`;
}

function formatTrendMetric(metric) {
  if (!metric || (metric.for == null && metric.against == null)) {
    return 'For: N/A | Against: N/A';
  }

  return `For: ${formatValue(metric.for)} | Against: ${formatValue(metric.against)}`;
}

function formatFormString(formLast5) {
  if (!formLast5) return 'N/A';
  return formLast5.split('').join('-');
}

function calculateFormPoints(formLast5) {
  if (!formLast5) return null;

  return formLast5
    .split('')
    .reduce((total, result) => total + (result === 'W' ? 3 : result === 'D' ? 1 : 0), 0);
}

function buildFormEdge(homeTeam, awayTeam, homeStats, awayStats) {
  const homeForm = homeStats?.formLast5;
  const awayForm = awayStats?.formLast5;

  if (!homeForm || !awayForm) {
    return 'unavailable';
  }

  const homePoints = calculateFormPoints(homeForm);
  const awayPoints = calculateFormPoints(awayForm);

  let edge = 'EVEN';
  if (homePoints > awayPoints) edge = `${homeTeam.name} edge`;
  if (awayPoints > homePoints) edge = `${awayTeam.name} edge`;

  return `${edge} | ${homeTeam.name}: ${formatFormString(homeForm)} (${homePoints} pts) vs ${awayTeam.name}: ${formatFormString(awayForm)} (${awayPoints} pts)`;
}

async function loadTeamStatsForContext(teamId, leagueId, season, label) {
  if (teamId == null || leagueId == null) {
    console.log(`[context-builder] ${label} stats skipped: missing teamId or leagueId`);
    return null;
  }

  try {
    const stats = await getTeamStats(teamId, leagueId, season);
    const hasMeaningfulStats = stats && Object.keys(stats).length > 0;
    console.log(`[context-builder] ${label} stats ${hasMeaningfulStats ? 'loaded' : 'empty'} for team=${teamId}, league=${leagueId}, season=${season ?? 'auto'}`);
    return hasMeaningfulStats ? stats : null;
  } catch (error) {
    console.warn(`[context-builder] ${label} stats unavailable for team=${teamId}, league=${leagueId}, season=${season ?? 'auto'}: ${error?.message ?? error}`);
    return null;
  }
}

function buildTeamStatsBlock(label, team, stats) {
  if (!stats) {
    return `[ ${label} SIGNALS ]\n`
      + `TEAM: ${team.name}\n`
      + `STATS STATUS: unavailable\n\n`;
  }

  return `[ ${label} SIGNALS ]\n`
    + `TEAM: ${team.name}\n`
    + `SOURCE: ${formatValue(stats.source)}\n`
    + `SEASON USED: ${formatValue(stats.season)}\n`
    + `MATCHES PLAYED: ${formatValue(stats.matchesPlayed)}\n`
    + `RECORD: ${formatRecord(stats)}\n`
    + `GOALS FOR / AGAINST: ${formatValue(stats.goalsFor)} / ${formatValue(stats.goalsAgainst)}\n`
    + `FORM LAST 5: ${formatFormString(stats.formLast5)}\n`
    + `HOME FORM: ${formatRecord(stats.homeForm)}\n`
    + `AWAY FORM: ${formatRecord(stats.awayForm)}\n`
    + `SHOTS: ${formatTrendMetric(stats.shots)}\n`
    + `SHOTS ON TARGET: ${formatTrendMetric(stats.shotsOnTarget)}\n`
    + `XG / XGA: ${formatValue(stats.xg)} / ${formatValue(stats.xga)}\n\n`;
}

function formatDelta(label, delta, homeTeam, awayTeam) {
  if (delta == null) {
    return `${label}: unavailable`;
  }

  const rounded = Math.round(delta * 100) / 100;
  const edgeLabel = rounded > 0
    ? `${homeTeam.name} edge`
    : rounded < 0
      ? `${awayTeam.name} edge`
      : 'even';

  return `${label}: ${rounded > 0 ? '+' : ''}${rounded} (${edgeLabel})`;
}

function buildDerivedEdgeSignalsBlock(homeTeam, awayTeam, homeStats, awayStats) {
  const xgDelta = (() => {
    const homeXg = toNumber(homeStats?.xg);
    const awayXg = toNumber(awayStats?.xg);
    return homeXg != null && awayXg != null ? homeXg - awayXg : null;
  })();

  const shotDelta = (() => {
    const homeShots = toNumber(homeStats?.shots?.for);
    const awayShots = toNumber(awayStats?.shots?.for);
    return homeShots != null && awayShots != null ? homeShots - awayShots : null;
  })();

  return `[ DERIVED EDGE SIGNALS ]\n`
    + `${formatDelta('XG DELTA', xgDelta, homeTeam, awayTeam)}\n`
    + `${formatDelta('SHOT DELTA', shotDelta, homeTeam, awayTeam)}\n`
    + `FORM EDGE: ${buildFormEdge(homeTeam, awayTeam, homeStats, awayStats)}\n\n`;
}

function buildOddsBlock(odds) {
  if (!odds) {
    return `[ MARKET SNAPSHOT ]\nODDS STATUS: unavailable\n\n`;
  }

  const homePrice = odds?.moneyline?.home ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((outcome) => outcome?.name === 'Home')?.price;
  const awayPrice = odds?.moneyline?.away ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((outcome) => outcome?.name === 'Away')?.price;
  const drawPrice = odds?.moneyline?.draw ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((outcome) => outcome?.name === 'Draw')?.price;
  const homeHandicap = odds?.runLine?.home?.spread;
  const homeHandicapPrice = odds?.runLine?.home?.price;
  const awayHandicap = odds?.runLine?.away?.spread;
  const awayHandicapPrice = odds?.runLine?.away?.price;
  const totalLine = odds?.overUnder?.total;
  const overPrice = odds?.overUnder?.overPrice;
  const underPrice = odds?.overUnder?.underPrice;

  return `[ MARKET SNAPSHOT ]\n`
    + `ODDS STATUS: available\n`
    + `1X2 HOME: ${formatOddsValue(homePrice)}\n`
    + `1X2 DRAW: ${formatOddsValue(drawPrice)}\n`
    + `1X2 AWAY: ${formatOddsValue(awayPrice)}\n`
    + `ASIAN HANDICAP HOME: ${homeHandicap != null ? `${homeHandicap} @ ${formatOddsValue(homeHandicapPrice)}` : 'N/A'}\n`
    + `ASIAN HANDICAP AWAY: ${awayHandicap != null ? `${awayHandicap} @ ${formatOddsValue(awayHandicapPrice)}` : 'N/A'}\n`
    + `OVER/UNDER: ${totalLine != null ? `${totalLine} | Over ${formatOddsValue(overPrice)} | Under ${formatOddsValue(underPrice)}` : 'N/A'}\n\n`;
}

function buildAvailabilityBlock({ matchMeta, homeStats, awayStats, odds }) {
  const availableSignals = [];
  const missingSignals = [];

  if (homeStats) availableSignals.push('homeTeamStats');
  else missingSignals.push('homeTeamStats');

  if (awayStats) availableSignals.push('awayTeamStats');
  else missingSignals.push('awayTeamStats');

  if (odds) availableSignals.push('marketOdds');
  else missingSignals.push('marketOdds');

  if (matchMeta.statusShort) availableSignals.push('matchStatus');
  else missingSignals.push('matchStatus');

  console.log(
    `[context-builder] match=${matchMeta.matchId ?? 'unknown'} source=${matchMeta.source} `
    + `available=${availableSignals.join(',') || 'none'} missing=${missingSignals.join(',') || 'none'}`,
  );

  return `[ DATA AVAILABILITY ]\n`
    + `AVAILABLE SIGNALS: ${availableSignals.join(', ') || 'none'}\n`
    + `MISSING SIGNALS: ${missingSignals.join(', ') || 'none'}\n\n`;
}

export async function buildMatchContext(match, odds = null) {
  const matchMeta = resolveMatchMeta(match);
  const homeTeam = resolveTeam(match, 'home');
  const awayTeam = resolveTeam(match, 'away');

  const [homeStats, awayStats] = await Promise.all([
    loadTeamStatsForContext(homeTeam.id, matchMeta.leagueId, matchMeta.season, 'home'),
    loadTeamStatsForContext(awayTeam.id, matchMeta.leagueId, matchMeta.season, 'away'),
  ]);

  let context = `H.E.X.A. F.C. - ELITE SOCCER ANALYSIS DIRECTIVE\n`;
  context += `====================================================\n\n`;

  context += `[ MATCH OVERVIEW ]\n`;
  context += `MATCH ID: ${formatValue(matchMeta.matchId)}\n`;
  context += `SOURCE: ${formatValue(matchMeta.source)}\n`;
  context += `LEAGUE: ${matchMeta.leagueName}\n`;
  context += `SEASON: ${formatValue(toValue(matchMeta.season), 'auto/unknown')}\n`;
  context += `FIXTURE: ${homeTeam.name} (Home) vs ${awayTeam.name} (Away)\n`;
  context += `VENUE: ${matchMeta.venueName} (Home Advantage Factor applies)\n`;
  context += `KICKOFF: ${formatValue(matchMeta.date)}\n`;
  context += `STATUS: ${formatValue(matchMeta.statusShort)} - ${formatValue(matchMeta.statusLong)}\n\n`;

  context += buildAvailabilityBlock({ matchMeta, homeStats, awayStats, odds });
  context += buildTeamStatsBlock('HOME TEAM', homeTeam, homeStats);
  context += buildTeamStatsBlock('AWAY TEAM', awayTeam, awayStats);
  context += buildDerivedEdgeSignalsBlock(homeTeam, awayTeam, homeStats, awayStats);
  context += buildOddsBlock(odds);

  context += `[ H.E.X.A. CORE INSTRUCTIONS ]\n`;
  context += `You are H.E.X.A. F.C., an elite, data-driven football (soccer) betting analyst.\n`;
  context += `Compare both teams directly instead of describing them separately.\n`;
  context += `Prioritize signals in this order: xG vs xGA, shots and shots on target, Form Last 5, home vs away performance, goals for/against, then market odds only to detect value.\n`;
  context += `Use the derived edge signals to identify where the measurable gap actually is.\n`;
  context += `If any signal is missing, continue with the remaining data, explicitly note the gap, and raise model risk instead of inventing information.\n`;
  context += `You must analyze this match and predict the most valuable outcomes across three primary markets:\n`;
  context += `1. 1X2 (Match Odds) - Evaluate Home Win, Draw, or Away Win.\n`;
  context += `2. ASIAN HANDICAP - Evaluate margin of victory, factoring in push (draw) scenarios.\n`;
  context += `3. OVER/UNDER GOALS - Project total match goals based on offensive/defensive form.\n\n`;

  context += `[ OUTPUT FORMAT ]\n`;
  context += `Provide a concise tactical breakdown focused on real edge, not narrative. Deliver one best bet only, a confidence score from 0-100, and model risk based on data quality. Format as JSON if required by the system.\n`;

  return context;
}
