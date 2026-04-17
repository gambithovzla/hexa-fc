import { getTeamStats } from './soccer-api.js';

function toValue(value, fallback = null) {
  return value == null || value === '' ? fallback : value;
}

function formatValue(value, fallback = 'N/A') {
  return value == null || value === '' ? fallback : String(value);
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

function buildOddsBlock(odds) {
  if (!odds) {
    return `[ MARKET SNAPSHOT ]\nODDS STATUS: unavailable\n\n`;
  }

  const homePrice = odds?.moneyline?.home ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((outcome) => outcome?.name === 'Home')?.price;
  const awayPrice = odds?.moneyline?.away ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((outcome) => outcome?.name === 'Away')?.price;
  const drawPrice = odds?.moneyline?.draw ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((outcome) => outcome?.name === 'Draw')?.price;

  return `[ MARKET SNAPSHOT ]\n`
    + `ODDS STATUS: available\n`
    + `HOME: ${formatValue(homePrice)}\n`
    + `DRAW: ${formatValue(drawPrice)}\n`
    + `AWAY: ${formatValue(awayPrice)}\n\n`;
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
  context += buildOddsBlock(odds);

  context += `[ H.E.X.A. CORE INSTRUCTIONS ]\n`;
  context += `You are H.E.X.A. F.C., an elite, data-driven football (soccer) betting analyst.\n`;
  context += `Use normalized team signals first and degrade gracefully when any block is unavailable.\n`;
  context += `Prioritize recent form, home/away performance, goals for/against, shots, shots on target, xG/xGA, and live match metadata when present.\n`;
  context += `If any signal is missing, continue the analysis using the remaining available signals and note the data gap instead of failing.\n`;
  context += `You must analyze this match and predict the most valuable outcomes across three primary markets:\n`;
  context += `1. 1X2 (Match Odds) - Evaluate Home Win, Draw, or Away Win.\n`;
  context += `2. ASIAN HANDICAP - Evaluate margin of victory, factoring in push (draw) scenarios.\n`;
  context += `3. OVER/UNDER GOALS - Project total match goals based on offensive/defensive form.\n\n`;

  context += `[ OUTPUT FORMAT ]\n`;
  context += `Provide a concise, ruthless tactical breakdown. Identify the single best Safe Pick and assign a Confidence Score (0-100%). Format as JSON if required by the system.\n`;

  return context;
}
