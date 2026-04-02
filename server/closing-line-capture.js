/**
 * closing-line-capture.js
 * Captures closing lines for pending picks and calculates CLV.
 *
 * Exported:
 *   captureClosingLines() → void
 */

import pool from './db.js';
import { getGameOdds, matchOddsToGame, calculateImpliedProbability } from './odds-api.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses a pick string and extracts the relevant American odds price
 * from a matched odds object, given the matchup string ("AWAY @ HOME").
 *
 * @param {string} pickStr     — e.g. "NYY Moneyline", "Over 8.5"
 * @param {object} matchedOdds — result from matchOddsToGame()
 * @param {string} matchupStr  — e.g. "NYY @ BOS"
 * @returns {number|null}      — American odds integer or null
 */
function extractPickOdds(pickStr, matchedOdds, matchupStr) {
  if (!pickStr || !matchedOdds?.odds) return null;
  const s   = pickStr.trim();
  const odd = matchedOdds.odds;

  // Determine away team abbreviation from matchup (format: "AWAY @ HOME" or "AWAY vs HOME")
  const awayToken = (matchupStr ?? '').split(/\s+(?:@|vs\.?)\s+/i)[0]?.trim().toUpperCase();

  // Over — "Over 8.5", "O 8.5", "Más de 8.5", "Mas de 8.5"
  if (/^(?:Over|O|M[aá]s\s+de)\s+\d/i.test(s)) {
    return odd.overUnder?.overPrice ?? null;
  }

  // Under — "Under 8.5", "U 8.5", "Menos de 8.5"
  if (/^(?:Under|U|Menos\s+de)\s+\d/i.test(s)) {
    return odd.overUnder?.underPrice ?? null;
  }

  // Over with team prefix — "NYY Alta 8.5"
  if (/Alta\s+\d/i.test(s)) return odd.overUnder?.overPrice ?? null;

  // Under with team prefix — "NYY Baja 8.5"
  if (/Baja\s+\d/i.test(s)) return odd.overUnder?.underPrice ?? null;

  // Moneyline — "NYY Moneyline", "NYY ML", "NYY A ganar", "NYY Dinero"
  const mlMatch = s.match(/^(.+?)\s+(?:Moneyline|ML|A\s+ganar|Dinero)$/i);
  if (mlMatch) {
    const token = mlMatch[1].trim().toUpperCase();
    const isAway = token === awayToken ||
      matchedOdds.awayTeam?.toUpperCase().includes(token);
    return isAway ? (odd.moneyline?.away ?? null) : (odd.moneyline?.home ?? null);
  }

  // Run Line favorite — "NYY -1.5 Run Line"
  const rlFavMatch = s.match(/^(.+?)\s+-\d+\.?\d*\s+(?:Run\s+Line|RL|L[ií]nea\s+de\s+Carrera)$/i);
  if (rlFavMatch) {
    const token = rlFavMatch[1].trim().toUpperCase();
    const isAway = token === awayToken;
    return isAway ? (odd.runLine?.away?.price ?? null) : (odd.runLine?.home?.price ?? null);
  }

  // Run Line underdog — "NYY +1.5 Run Line"
  const rlDogMatch = s.match(/^(.+?)\s+\+\d+\.?\d*\s+(?:Run\s+Line|RL|L[ií]nea\s+de\s+Carrera)$/i);
  if (rlDogMatch) {
    const token = rlDogMatch[1].trim().toUpperCase();
    const isAway = token === awayToken;
    return isAway ? (odd.runLine?.away?.price ?? null) : (odd.runLine?.home?.price ?? null);
  }

  return null;
}

/**
 * Finds the game in a games list that corresponds to a matchup string.
 * Supports: "NYY @ BOS", "NYY vs BOS", "NYY - BOS", etc.
 */
function findGameForMatchup(matchup, games) {
  if (!matchup || !games?.length) return null;
  const parts = matchup.split(/\s+(?:vs\.?|@|at|-)\s+/i);
  if (parts.length < 2) return null;

  const [tok1, tok2] = parts.map(t => t.trim().toLowerCase());

  for (const game of games) {
    const home = game.teams?.home;
    const away = game.teams?.away;
    if (!home || !away) continue;

    const homeN  = (home.name ?? '').toLowerCase();
    const awayN  = (away.name ?? '').toLowerCase();
    const homeAb = (home.abbreviation ?? '').toLowerCase();
    const awayAb = (away.abbreviation ?? '').toLowerCase();

    const match1 = (tok1 === awayAb || awayN.includes(tok1)) && (tok2 === homeAb || homeN.includes(tok2));
    const match2 = (tok1 === homeAb || homeN.includes(tok1)) && (tok2 === awayAb || awayN.includes(tok2));

    if (match1 || match2) return game;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Finds pending picks without closing_odds whose game is about to start
 * (within 30 minutes) or has already started, then captures the closing line
 * and computes CLV = implied_prob_closing − implied_prob_at_pick.
 */
export async function captureClosingLines() {
  console.log('[closing-line] Soccer closing line capture is pending implementation.');
  return;
}
