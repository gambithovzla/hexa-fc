function toWords(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

export function normalizePickText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function getMatchId(match) {
  return match?.matchId ?? match?.fixture?.id ?? match?.gamePk ?? match?.id ?? null;
}

export function getMatchKickoff(match) {
  const raw = match?.date ?? match?.fixture?.date ?? match?.gameDate ?? null;
  if (!raw) return null;

  const kickoff = new Date(raw);
  return Number.isNaN(kickoff.getTime()) ? null : kickoff;
}

export function getMatchMinute(match) {
  const candidates = [
    match?.status?.phase,
    match?.fixture?.status?.elapsed,
    match?.sourceMeta?.rawStatusShort,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export function getMatchStatus(match) {
  const short = String(match?.status?.short ?? match?.fixture?.status?.short ?? '').toUpperCase();
  const long = String(match?.status?.long ?? match?.fixture?.status?.long ?? '').trim() || 'Unknown';
  const isFinished = Boolean(match?.status?.isFinished) || ['FT', 'AET', 'PEN', 'WO', 'AWD'].includes(short);
  const isLive = !isFinished && (Boolean(match?.status?.isLive) || ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short));

  return { short, long, isFinished, isLive };
}

export function getMatchupFromMatch(match) {
  const away = match?.awayTeam?.name ?? match?.teams?.away?.name ?? 'Away';
  const home = match?.homeTeam?.name ?? match?.teams?.home?.name ?? 'Home';
  return `${away} @ ${home}`;
}

export function splitMatchup(matchup) {
  const parts = String(matchup ?? '')
    .split(/\s+(?:@|vs\.?|at|-)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;
  return { away: parts[0], home: parts[1] };
}

export function selectionMentions(selection, candidate) {
  const normalizedSelection = normalizePickText(selection);
  const normalizedCandidate = normalizePickText(candidate);

  if (!normalizedSelection || !normalizedCandidate) return false;
  if (normalizedSelection.includes(normalizedCandidate)) return true;

  return toWords(normalizedCandidate).some((token) => normalizedSelection.includes(token));
}

function scoreCandidateName(sourceToken, team) {
  if (!sourceToken || !team) return 0;

  const teamNames = [
    team?.name,
    team?.shortName,
    team?.abbreviation,
    team?.team?.name,
    team?.team?.abbreviation,
  ].filter(Boolean);

  let score = 0;

  for (const candidate of teamNames) {
    if (selectionMentions(sourceToken, candidate)) {
      score = Math.max(score, 3);
    } else {
      const sourceWords = new Set(toWords(sourceToken));
      const candidateWords = toWords(candidate);
      const overlap = candidateWords.filter((word) => sourceWords.has(word)).length;
      score = Math.max(score, overlap);
    }
  }

  return score;
}

export function findMatchByMatchup(matchup, matches = []) {
  const tokens = splitMatchup(matchup);
  if (!tokens || !matches.length) return null;

  let bestMatch = null;
  let bestScore = -1;

  for (const match of matches) {
    const homeTeam = match?.homeTeam ?? match?.teams?.home;
    const awayTeam = match?.awayTeam ?? match?.teams?.away;
    if (!homeTeam || !awayTeam) continue;

    const normalScore =
      scoreCandidateName(tokens.away, awayTeam) +
      scoreCandidateName(tokens.home, homeTeam);
    const invertedScore =
      scoreCandidateName(tokens.away, homeTeam) +
      scoreCandidateName(tokens.home, awayTeam);

    const score = Math.max(normalScore, invertedScore > normalScore ? invertedScore - 1 : normalScore);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

export function resolveSelectionSide(selection, matchup, matchOrOdds = null) {
  const normalizedSelection = normalizePickText(selection);
  if (!normalizedSelection) return null;

  if (/^(1|home|local)\b/.test(normalizedSelection)) return 'home';
  if (/^(2|away|visitor|visitante)\b/.test(normalizedSelection)) return 'away';
  if (/^(x|draw|empate|tie)\b/.test(normalizedSelection) || /\b(draw|empate|tie)\b/.test(normalizedSelection)) {
    return 'draw';
  }

  const homeCandidate =
    matchOrOdds?.homeTeam?.name ??
    matchOrOdds?.homeTeam ??
    matchOrOdds?.teams?.home?.name ??
    matchOrOdds?.odds?.homeTeam ??
    matchOrOdds?.home_name ??
    null;
  const awayCandidate =
    matchOrOdds?.awayTeam?.name ??
    matchOrOdds?.awayTeam ??
    matchOrOdds?.teams?.away?.name ??
    matchOrOdds?.odds?.awayTeam ??
    matchOrOdds?.away_name ??
    null;

  if (selectionMentions(selection, homeCandidate)) return 'home';
  if (selectionMentions(selection, awayCandidate)) return 'away';

  const matchupTokens = splitMatchup(matchup);
  if (selectionMentions(selection, matchupTokens?.home)) return 'home';
  if (selectionMentions(selection, matchupTokens?.away)) return 'away';

  return null;
}

export function detectSoccerMarket(selection, explicitType = '') {
  const normalizedSelection = normalizePickText(selection);
  const normalizedType = normalizePickText(explicitType);
  const combined = `${normalizedType} ${normalizedSelection}`.trim();

  if (/\b(draw no bet|dnb|empate no accion|empate no apuesta)\b/.test(combined)) {
    return 'draw_no_bet';
  }

  if (/\b(both teams to score|btts|ambos marcan|ambos anotan)\b/.test(combined)) {
    return 'btts';
  }

  if (
    /\b(asian handicap|handicap|ah)\b/.test(combined) ||
    /\s[+-]\d+(?:\.\d+)?\b/.test(normalizedSelection)
  ) {
    return 'asian_handicap';
  }

  if (/\b(over|under|mas de|menos de|alta|baja|total goals|goals)\b/.test(combined)) {
    return 'over_under_goals';
  }

  return 'one_x_two';
}

export function parseTotalLine(selection) {
  const match = String(selection ?? '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseAsianHandicapLine(selection) {
  const match = String(selection ?? '').match(/([+-]\d+(?:\.\d+)?)/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBttsChoice(selection) {
  const normalizedSelection = normalizePickText(selection);
  if (/\b(no|not|false)\b/.test(normalizedSelection)) return 'no';
  if (/\b(yes|si|both teams|ambos)\b/.test(normalizedSelection)) return 'yes';
  return null;
}

export function parseStoredPick(pickRow, match = null) {
  const bestPick = safeJsonParse(pickRow?.best_pick, {}) ?? {};
  const selection = bestPick?.detail ?? pickRow?.pick ?? '';
  const explicitType = bestPick?.type ?? pickRow?.type ?? '';
  const marketType = detectSoccerMarket(selection, explicitType);
  const side = resolveSelectionSide(selection, pickRow?.matchup, match);

  return {
    bestPick,
    selection,
    explicitType,
    marketType,
    side,
    totalLine: marketType === 'over_under_goals' ? parseTotalLine(selection) : null,
    handicapLine: marketType === 'asian_handicap' ? parseAsianHandicapLine(selection) : null,
    bttsChoice: marketType === 'btts' ? parseBttsChoice(selection) : null,
  };
}

function splitAsianLine(line) {
  if (!Number.isFinite(line)) return [];

  const rounded = Math.round(line * 100) / 100;
  const sign = rounded < 0 ? -1 : 1;
  const abs = Math.abs(rounded);
  const decimal = Math.round((abs % 1) * 100);

  if (decimal === 25) {
    const base = Math.floor(abs);
    return [sign * base, sign * (base + 0.5)];
  }

  if (decimal === 75) {
    const base = Math.floor(abs) + 0.5;
    return [sign * base, sign * (base + 0.5)];
  }

  return [rounded];
}

function settleAsianSegment(homeScore, awayScore, side, line) {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || !side || !Number.isFinite(line)) {
    return null;
  }

  const selectionScore = side === 'home' ? homeScore : awayScore;
  const opponentScore = side === 'home' ? awayScore : homeScore;
  const adjustedScore = selectionScore + line;

  if (adjustedScore > opponentScore) return 'win';
  if (adjustedScore < opponentScore) return 'loss';
  return 'push';
}

function settleAsianHandicap(homeScore, awayScore, side, line) {
  const settlements = splitAsianLine(line)
    .map((segment) => settleAsianSegment(homeScore, awayScore, side, segment))
    .filter(Boolean);

  if (!settlements.length) return null;
  if (settlements.every((result) => result === settlements[0])) return settlements[0];

  // Quarter-line split outcomes are collapsed to push until the ledger supports half-win/half-loss.
  return 'push';
}

export function settlePickAgainstMatch(pickRow, match) {
  const homeScore = Number(match?.score?.home ?? match?.goals?.home);
  const awayScore = Number(match?.score?.away ?? match?.goals?.away);

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }

  const parsed = parseStoredPick(pickRow, match);

  switch (parsed.marketType) {
    case 'draw_no_bet':
      if (homeScore === awayScore) return 'push';
      if (parsed.side === 'home') return homeScore > awayScore ? 'win' : 'loss';
      if (parsed.side === 'away') return awayScore > homeScore ? 'win' : 'loss';
      return null;

    case 'asian_handicap':
      return settleAsianHandicap(homeScore, awayScore, parsed.side, parsed.handicapLine);

    case 'over_under_goals': {
      const line = parsed.totalLine;
      if (!Number.isFinite(line)) return null;
      const totalGoals = homeScore + awayScore;
      const normalizedSelection = normalizePickText(parsed.selection);

      if (/^(over|o\b|mas de|alta)/.test(normalizedSelection)) {
        if (totalGoals > line) return 'win';
        if (totalGoals < line) return 'loss';
        return 'push';
      }

      if (/^(under|u\b|menos de|baja)/.test(normalizedSelection)) {
        if (totalGoals < line) return 'win';
        if (totalGoals > line) return 'loss';
        return 'push';
      }

      return null;
    }

    case 'btts': {
      const bothTeamsScored = homeScore > 0 && awayScore > 0;
      if (parsed.bttsChoice === 'yes') return bothTeamsScored ? 'win' : 'loss';
      if (parsed.bttsChoice === 'no') return bothTeamsScored ? 'loss' : 'win';
      return null;
    }

    case 'one_x_two':
    default:
      if (parsed.side === 'draw') return homeScore === awayScore ? 'win' : 'loss';
      if (parsed.side === 'home') return homeScore > awayScore ? 'win' : 'loss';
      if (parsed.side === 'away') return awayScore > homeScore ? 'win' : 'loss';
      return null;
  }
}

export function resolveOddsForPick({ pick, bestPick, odds, matchup, match = null }) {
  const normalizedOdds = odds?.odds ?? odds ?? null;
  if (!normalizedOdds) return null;

  const selection = bestPick?.detail ?? pick ?? '';
  const marketType = detectSoccerMarket(selection, bestPick?.type);
  const side = resolveSelectionSide(selection, matchup, match ?? odds);
  const moneyline = normalizedOdds.moneyline ?? null;
  const asianHandicap = normalizedOdds.runLine ?? normalizedOdds.asianHandicap ?? null;
  const totals = normalizedOdds.overUnder ?? null;

  if (marketType === 'over_under_goals') {
    const normalizedSelection = normalizePickText(selection);
    if (/^(over|o\b|mas de|alta)/.test(normalizedSelection)) return totals?.overPrice ?? null;
    if (/^(under|u\b|menos de|baja)/.test(normalizedSelection)) return totals?.underPrice ?? null;
    return null;
  }

  if (marketType === 'asian_handicap') {
    if (side === 'home') return asianHandicap?.home?.price ?? null;
    if (side === 'away') return asianHandicap?.away?.price ?? null;
    return null;
  }

  if (side === 'draw') return moneyline?.draw ?? null;
  if (side === 'home') return moneyline?.home ?? null;
  if (side === 'away') return moneyline?.away ?? null;

  return moneyline?.home ?? moneyline?.away ?? moneyline?.draw ?? null;
}

function deriveLiveTone(parsed, homeScore, awayScore, isFinished) {
  if (isFinished) return 'neutral';

  switch (parsed.marketType) {
    case 'draw_no_bet':
    case 'one_x_two':
    case 'asian_handicap':
      if (parsed.side === 'draw') {
        if (homeScore === awayScore) return 'positive';
        return 'negative';
      }
      if (parsed.side === 'home') {
        if (homeScore > awayScore) return 'positive';
        if (homeScore < awayScore) return 'negative';
        return 'neutral';
      }
      if (parsed.side === 'away') {
        if (awayScore > homeScore) return 'positive';
        if (awayScore < homeScore) return 'negative';
        return 'neutral';
      }
      return 'neutral';

    case 'over_under_goals': {
      const totalGoals = homeScore + awayScore;
      const line = parsed.totalLine ?? 0;
      const normalizedSelection = normalizePickText(parsed.selection);
      const isOver = /^(over|o\b|mas de|alta)/.test(normalizedSelection);
      if (isOver) return totalGoals >= line ? 'positive' : 'neutral';
      return totalGoals >= line ? 'negative' : 'positive';
    }

    case 'btts': {
      const scoredTeams = (homeScore > 0 ? 1 : 0) + (awayScore > 0 ? 1 : 0);
      if (parsed.bttsChoice === 'yes') return scoredTeams === 2 ? 'positive' : 'neutral';
      return scoredTeams === 2 ? 'negative' : 'positive';
    }

    default:
      return 'neutral';
  }
}

export function buildLiveProgress(pickRow, match) {
  const parsed = parseStoredPick(pickRow, match);
  const status = getMatchStatus(match);
  const minute = getMatchMinute(match);
  const homeScore = Number(match?.score?.home ?? match?.goals?.home ?? 0);
  const awayScore = Number(match?.score?.away ?? match?.goals?.away ?? 0);
  const finalResult = status.isFinished ? settlePickAgainstMatch(pickRow, match) : null;

  let progress = 0;

  switch (parsed.marketType) {
    case 'draw_no_bet':
    case 'one_x_two':
      if (parsed.side === 'draw') {
        progress = homeScore === awayScore ? 100 : 25;
      } else if (parsed.side === 'home') {
        progress = homeScore > awayScore ? 100 : homeScore === awayScore ? 50 : 15;
      } else if (parsed.side === 'away') {
        progress = awayScore > homeScore ? 100 : homeScore === awayScore ? 50 : 15;
      } else {
        progress = 0;
      }
      break;

    case 'asian_handicap': {
      const selectionScore = parsed.side === 'home' ? homeScore : awayScore;
      const opponentScore = parsed.side === 'home' ? awayScore : homeScore;
      const adjusted = selectionScore + (parsed.handicapLine ?? 0);
      progress = adjusted > opponentScore ? 100 : adjusted === opponentScore ? 50 : 20;
      break;
    }

    case 'over_under_goals': {
      const totalGoals = homeScore + awayScore;
      const line = parsed.totalLine ?? 1;
      const normalizedSelection = normalizePickText(parsed.selection);
      const ratio = Math.max(0, Math.min(1, totalGoals / Math.max(line, 1)));

      if (/^(under|u\b|menos de|baja)/.test(normalizedSelection)) {
        progress = totalGoals >= line ? 15 : Math.round((1 - ratio) * 100);
      } else {
        progress = Math.round(ratio * 100);
      }
      break;
    }

    case 'btts': {
      const scoredTeams = (homeScore > 0 ? 1 : 0) + (awayScore > 0 ? 1 : 0);
      progress = parsed.bttsChoice === 'yes'
        ? scoredTeams * 50
        : scoredTeams === 0
          ? 100
          : scoredTeams === 1
            ? 50
            : 0;
      break;
    }

    default:
      progress = 0;
  }

  return {
    pickId: pickRow.id,
    matchId: getMatchId(match),
    matchup: pickRow.matchup,
    pick: pickRow.pick,
    label: parsed.selection || pickRow.pick,
    marketType: parsed.marketType,
    status: finalResult ?? (status.isLive ? 'live' : 'pending'),
    tone: finalResult === 'win'
      ? 'positive'
      : finalResult === 'loss'
        ? 'negative'
        : finalResult === 'push'
          ? 'neutral'
          : deriveLiveTone(parsed, homeScore, awayScore, status.isFinished),
    progress,
    detail: `${awayScore}-${homeScore}${minute != null ? ` at ${minute}'` : ''}`,
    score: {
      home: homeScore,
      away: awayScore,
    },
    minute,
    kickoff: getMatchKickoff(match)?.toISOString() ?? null,
  };
}

export function buildDateCandidates(seedDate, extraDays = [0, -1, 1, 2]) {
  const baseDate = seedDate instanceof Date ? seedDate : new Date(seedDate ?? Date.now());
  if (Number.isNaN(baseDate.getTime())) return [];

  const base = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));
  const dates = new Set();

  for (const offset of extraDays) {
    const current = new Date(base);
    current.setUTCDate(current.getUTCDate() + offset);
    dates.add(current.toISOString().slice(0, 10));
  }

  return [...dates];
}

export function isKickoffWithinMinutes(match, beforeMinutes, afterMinutes = 0) {
  const kickoff = getMatchKickoff(match);
  if (!kickoff) return false;

  const deltaMinutes = (kickoff.getTime() - Date.now()) / 60000;
  return deltaMinutes <= beforeMinutes && deltaMinutes >= -afterMinutes;
}
