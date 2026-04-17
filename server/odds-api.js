/**
 * odds-api.js - The Odds API integration for H.E.X.A. F.C.
 *
 * Exports:
 *   getOdds() - fetch + cache football odds by leagueId or all supported leagues
 *   getGameOdds() - backward-compatible wrapper
 *   matchOddsToGame(oddsData, home, away) - fuzzy-match a game
 *   calculateImpliedProbability(americanOdds) - American to implied probability
 *   convertOdds(americanOdds) - American to decimal
 *   calculatePayout(stake, americanOdds) - compute potential payout
 */

import { ODDS_API_MAP } from './soccer-api.js';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const CACHE_TTL_MS = 60 * 60 * 1000;
const AGGREGATE_CACHE_KEY = '__all_soccer__';

const _cache = new Map();
const FOOTBALL_MARKETS = Object.freeze({
  oneXTwo: '1X2',
  overUnder: 'Over/Under',
  asianHandicap: 'Asian Handicap',
});

function getSupportedSportKeys() {
  return [...new Set(Object.values(ODDS_API_MAP).filter(Boolean))];
}

function resolveSportKeys(input = null) {
  if (input == null || input === '') {
    return getSupportedSportKeys();
  }

  if (typeof input === 'number' || /^\d+$/.test(String(input))) {
    const leagueId = Number(input);
    const sportKey = ODDS_API_MAP[leagueId];
    return sportKey ? [sportKey] : [];
  }

  const sportKey = String(input).trim();
  return getSupportedSportKeys().includes(sportKey) ? [sportKey] : [];
}

async function fetchOddsForSportKey(sportKey, apiKey) {
  const cacheKey = sportKey || AGGREGATE_CACHE_KEY;
  const cached = _cache.get(cacheKey);

  if (cached?.data && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log('[odds-api] Returning cached data for', cacheKey, cached.data.length, 'events');
    return cached.data;
  }

  const url =
    `${ODDS_API_BASE}/sports/${sportKey}/odds/?` +
    `apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;

  console.log('[odds-api] Fetching URL:', url.replace(apiKey, `${apiKey.substring(0, 8)}...`));

  const res = await fetch(url);
  console.log('[odds-api] Response status:', sportKey, res.status, res.statusText);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[odds-api] API error ${sportKey} ${res.status} - body: ${body.substring(0, 200)}`);
    return cached?.data ?? [];
  }

  const raw = await res.json();
  console.log(
    '[odds-api] Raw events returned:',
    sportKey,
    Array.isArray(raw) ? raw.length : 'not an array',
    typeof raw === 'string' ? raw.substring(0, 200) : '',
  );

  const data = (Array.isArray(raw) ? raw : [])
    .map((event) => normalizeEvent(event, sportKey))
    .filter(Boolean);

  _cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

/**
 * Fetches football odds from The Odds API by leagueId.
 * When no leagueId is provided, it aggregates every supported football league from ODDS_API_MAP.
 *
 * @param {number|string|null} leagueId
 * @returns {Promise<Array>}
 */
export async function getOdds(leagueId = null) {
  const apiKey = process.env.ODDS_API_KEY;
  const sportKeys = resolveSportKeys(leagueId);
  const isSingleLeague = sportKeys.length === 1;
  const resolvedSportKey = isSingleLeague ? sportKeys[0] : AGGREGATE_CACHE_KEY;
  const cached = _cache.get(resolvedSportKey);

  console.log('[odds-api] API key present:', apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING');
  console.log('[odds-api] Requested leagueId:', leagueId ?? 'all');
  console.log('[odds-api] Resolved sport keys:', sportKeys.join(', ') || 'none');

  if (!apiKey) {
    console.warn('[odds-api] ODDS_API_KEY not set - skipping fetch');
    return [];
  }

  if (!sportKeys.length) {
    console.warn('[odds-api] No supported football sport key found for leagueId:', leagueId);
    return cached?.data ?? [];
  }

  if (cached?.data && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log('[odds-api] Returning cached data:', cached.data.length, 'events');
    return cached.data;
  }

  try {
    if (isSingleLeague) {
      return await fetchOddsForSportKey(sportKeys[0], apiKey);
    }

    const results = await Promise.all(
      sportKeys.map((currentSportKey) => fetchOddsForSportKey(currentSportKey, apiKey))
    );

    const data = results.flat();
    if (!data.length) {
      console.warn('[odds-api] 0 football events returned across supported leagues');
    }

    _cache.set(AGGREGATE_CACHE_KEY, { data, ts: Date.now() });
    console.log('[odds-api] Normalized events:', data.length);
    return data;
  } catch (err) {
    console.error('[odds-api] fetch error:', err.message);
    return cached?.data ?? [];
  }
}

export async function getGameOdds(leagueIdOrSportKey = null) {
  return getOdds(leagueIdOrSportKey);
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

function normalizeEvent(event, sportKey) {
  if (!event?.bookmakers?.length) return null;

  const books = event.bookmakers.slice(0, 3);

  const mlHome = [];
  const mlDraw = [];
  const mlAway = [];
  const rlHomeSpread = [];
  const rlHomePrice = [];
  const rlAwaySpread = [];
  const rlAwayPrice = [];
  const ouTotal = [];
  const ouOver = [];
  const ouUnder = [];

  for (const book of books) {
    for (const market of book.markets ?? []) {
      switch (market.key) {
        case 'h2h':
          for (const outcome of market.outcomes ?? []) {
            if (outcome.name === event.home_team) mlHome.push(outcome.price);
            else if (outcome.name === 'Draw') mlDraw.push(outcome.price);
            else if (outcome.name === event.away_team) mlAway.push(outcome.price);
          }
          break;
        case 'spreads':
          for (const outcome of market.outcomes ?? []) {
            if (outcome.name === event.home_team) {
              rlHomeSpread.push(outcome.point);
              rlHomePrice.push(outcome.price);
            } else if (outcome.name === event.away_team) {
              rlAwaySpread.push(outcome.point);
              rlAwayPrice.push(outcome.price);
            }
          }
          break;
        case 'totals':
          for (const outcome of market.outcomes ?? []) {
            ouTotal.push(outcome.point);
            if (outcome.name === 'Over') ouOver.push(outcome.price);
            else if (outcome.name === 'Under') ouUnder.push(outcome.price);
          }
          break;
      }
    }
  }

  const mlHomeAvg = avg(mlHome);
  const mlDrawAvg = avg(mlDraw);
  const mlAwayAvg = avg(mlAway);

  if (mlHomeAvg == null && mlDrawAvg == null && mlAwayAvg == null) {
    return null;
  }

  return {
    sportKey,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commenceTime: event.commence_time ?? null,
    markets: {
      [FOOTBALL_MARKETS.oneXTwo]: {
        home: mlHomeAvg != null ? Math.round(mlHomeAvg) : null,
        draw: mlDrawAvg != null ? Math.round(mlDrawAvg) : null,
        away: mlAwayAvg != null ? Math.round(mlAwayAvg) : null,
      },
      [FOOTBALL_MARKETS.overUnder]: {
        total: ouTotal.length ? +(avg(ouTotal).toFixed(1)) : null,
        overPrice: ouOver.length ? Math.round(avg(ouOver)) : null,
        underPrice: ouUnder.length ? Math.round(avg(ouUnder)) : null,
      },
      [FOOTBALL_MARKETS.asianHandicap]: {
        home: {
          spread: rlHomeSpread.length ? +(avg(rlHomeSpread).toFixed(1)) : null,
          price: rlHomePrice.length ? Math.round(avg(rlHomePrice)) : null,
        },
        away: {
          spread: rlAwaySpread.length ? +(avg(rlAwaySpread).toFixed(1)) : null,
          price: rlAwayPrice.length ? Math.round(avg(rlAwayPrice)) : null,
        },
      },
    },
    odds: {
      moneyline: {
        home: mlHomeAvg != null ? Math.round(mlHomeAvg) : null,
        draw: mlDrawAvg != null ? Math.round(mlDrawAvg) : null,
        away: mlAwayAvg != null ? Math.round(mlAwayAvg) : null,
      },
      runLine: {
        home: {
          spread: rlHomeSpread.length ? +(avg(rlHomeSpread).toFixed(1)) : null,
          price: rlHomePrice.length ? Math.round(avg(rlHomePrice)) : null,
        },
        away: {
          spread: rlAwaySpread.length ? +(avg(rlAwaySpread).toFixed(1)) : null,
          price: rlAwayPrice.length ? Math.round(avg(rlAwayPrice)) : null,
        },
      },
      overUnder: {
        total: ouTotal.length ? +(avg(ouTotal).toFixed(1)) : null,
        overPrice: ouOver.length ? Math.round(avg(ouOver)) : null,
        underPrice: ouUnder.length ? Math.round(avg(ouUnder)) : null,
      },
    },
  };
}

/**
 * Fuzzy-matches an odds data array to a specific game by team names.
 *
 * @param {Array} oddsData
 * @param {string} homeTeamName
 * @param {string} awayTeamName
 * @returns {object|null}
 */
export function matchOddsToGame(oddsData, homeTeamName, awayTeamName) {
  if (!homeTeamName || !awayTeamName || !oddsData?.length) return null;

  const words = (value) =>
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 2);

  const overlap = (a, b) => {
    const bWords = new Set(words(b));
    return words(a).filter((word) => bWords.has(word)).length;
  };

  let best = null;
  let bestScore = -1;

  for (const event of oddsData) {
    const score = overlap(homeTeamName, event.homeTeam) + overlap(awayTeamName, event.awayTeam);
    if (score > bestScore) {
      bestScore = score;
      best = event;
    }
  }

  return bestScore > 0 ? best : null;
}

/**
 * Converts American odds to implied probability (percentage).
 *
 * @param {number} americanOdds
 * @returns {number|null}
 */
export function calculateImpliedProbability(americanOdds) {
  const odds = Number(americanOdds);
  if (!Number.isFinite(odds) || odds === 0) return null;

  const probability = odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);

  return Math.round(probability * 1000) / 10;
}

/**
 * Converts American odds to decimal.
 *
 * @param {number} americanOdds
 * @returns {number|null}
 */
export function convertOdds(americanOdds) {
  const odds = Number(americanOdds);
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
}

/**
 * Calculates payout for a stake and American odds.
 *
 * @param {number} stake
 * @param {number} americanOdds
 * @returns {{ stake: number, profit: number, totalPayout: number }|null}
 */
export function calculatePayout(stake, americanOdds) {
  const normalizedStake = Number(stake);
  const odds = Number(americanOdds);
  if (!Number.isFinite(normalizedStake) || !Number.isFinite(odds) || normalizedStake <= 0 || odds === 0) {
    return null;
  }

  const profit = odds > 0
    ? normalizedStake * (odds / 100)
    : normalizedStake * (100 / Math.abs(odds));

  return {
    stake,
    profit: Math.round(profit * 100) / 100,
    totalPayout: Math.round((normalizedStake + profit) * 100) / 100,
  };
}
