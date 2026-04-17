/**
 * useHistory.js
 * Custom hook for tracking H.E.X.A. picks and results.
 *
 * When the user is authenticated: persists via PostgreSQL (/api/picks).
 * When not authenticated: falls back to localStorage for anonymous sessions.
 *
 * Entry shape (both sources normalised to the same object):
 *   {
 *     id:         number   (DB serial id, or Date.now() for localStorage)
 *     date:       string   (ISO — created_at from DB, or local timestamp)
 *     matchup:    string   ("Away @ Home" | "N-Leg Parlay" | "Full Day — YYYY-MM-DD")
 *     mode:       string   ("single" | "parlay" | "fullday")
 *     pick:       string   (master pick text)
 *     confidence: number   (0-100)
 *     result:     string   ("pending" | "win" | "loss")
 *   }
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../store/authStore';

const STORAGE_KEY = 'hexa_history';
const MAX_ENTRIES = 200;

// ── localStorage helpers (anonymous fallback) ─────────────────────────────────

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(entries) {
  if (!Array.isArray(entries)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or unavailable — ignore
  }
}

// ── Payload extraction helpers ────────────────────────────────────────────────

function normalizePickText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function selectionMentions(selection, candidate) {
  const normalizedSelection = normalizePickText(selection);
  const normalizedCandidate = normalizePickText(candidate);
  if (!normalizedSelection || !normalizedCandidate) return false;
  if (normalizedSelection.includes(normalizedCandidate)) return true;

  return normalizedCandidate
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .some((token) => normalizedSelection.includes(token));
}

function resolvePickSide(selection, matchup, oddsData, payload) {
  const normalizedSelection = normalizePickText(selection);
  if (!normalizedSelection) return null;

  if (/\b(draw|empate|tie)\b/.test(normalizedSelection)) return 'draw';
  if (/\b(home|local)\b/.test(normalizedSelection)) return 'home';
  if (/\b(away|visitor|visitante)\b/.test(normalizedSelection)) return 'away';

  const homeName = oddsData?.homeTeam ?? payload?.games?.[0]?.teams?.home?.name ?? '';
  const awayName = oddsData?.awayTeam ?? payload?.games?.[0]?.teams?.away?.name ?? '';
  if (selectionMentions(selection, homeName)) return 'home';
  if (selectionMentions(selection, awayName)) return 'away';

  const [awayToken = '', homeToken = ''] = String(matchup ?? '').split(/\s+(?:@|vs\.?|at|-)\s+/i);
  if (selectionMentions(selection, awayToken)) return 'away';
  if (selectionMentions(selection, homeToken)) return 'home';

  return null;
}

function resolveFootballOdds(selection, matchup, oddsData, payload) {
  if (!oddsData) return null;

  const normalizedSelection = normalizePickText(selection);
  const ml = oddsData.moneyline;
  const rl = oddsData.runLine;
  const ou = oddsData.overUnder;

  if (/^(over|o\b|mas de|alta)/.test(normalizedSelection)) return ou?.overPrice ?? null;
  if (/^(under|u\b|menos de|baja)/.test(normalizedSelection)) return ou?.underPrice ?? null;

  const side = resolvePickSide(selection, matchup, oddsData, payload);
  const isAsianHandicap =
    /\b(asian handicap|handicap|ah)\b/.test(normalizedSelection) ||
    /\s[+-]\d+(\.\d+)?\b/.test(normalizedSelection);

  if (isAsianHandicap) {
    if (side === 'home') return rl?.home?.price ?? null;
    if (side === 'away') return rl?.away?.price ?? null;
    return rl?.home?.price ?? rl?.away?.price ?? null;
  }

  if (side === 'draw') return ml?.draw ?? null;
  if (side === 'away') return ml?.away ?? null;
  if (side === 'home') return ml?.home ?? null;

  return ml?.home ?? ml?.away ?? ml?.draw ?? null;
}

function extractMatchup(payload) {
  // Direct override from safe_multi or batch scan
  if (payload._matchupOverride) return payload._matchupOverride;

  const mode  = payload.type ?? 'single';
  const games = payload.games ?? [];

  if ((mode === 'single' || mode === 'safe') && games.length > 0) {
    const g    = games[0];
    const away = g?.teams?.away?.abbreviation ?? g?.teams?.away?.name ?? 'Away';
    const home = g?.teams?.home?.abbreviation ?? g?.teams?.home?.name ?? 'Home';
    return `${away} @ ${home}`;
  }

  if (mode === 'parlay') {
    const gameNames = games.map(g => {
      const away = g?.teams?.away?.abbreviation ?? g?.teams?.away?.name ?? '';
      const home = g?.teams?.home?.abbreviation ?? g?.teams?.home?.name ?? '';
      return away && home ? `${away}@${home}` : '';
    }).filter(Boolean);
    return gameNames.length > 0
      ? `Parlay: ${gameNames.join(', ')}`
      : `${games.length}-Leg Parlay`;
  }

  const date = (payload.date ?? new Date().toISOString()).split('T')[0];
  return `Full Day — ${date}`;
}

function extractPickAndConfidence(hexaData) {
  if (!hexaData) return { pick: '', confidence: 0 };

  if (hexaData.safe_pick) {
    const sp   = hexaData.safe_pick;
    const conf = Math.min(100, Math.max(0, Number(sp.hit_probability) || 0));
    return { pick: sp.pick ?? '', confidence: conf };
  }

  if (hexaData.master_prediction) {
    const mp   = hexaData.master_prediction;
    const conf = Math.min(100, Math.max(0, Number(mp.oracle_confidence) || 0));
    return { pick: mp.pick ?? '', confidence: conf };
  }

  if (hexaData.parlay) {
    const p    = hexaData.parlay;
    const legs = p.legs ?? [];
    const pick = legs.map(l => {
      const game = l.game ?? l.matchup ?? '';
      const pickText = l.pick ?? '';
      // Include game name with pick so history shows which game each pick belongs to
      return game ? `${game}: ${pickText}` : pickText;
    }).filter(Boolean).join(' ＋ ');
    const raw  = Number(p.combined_confidence) || 0;
    const conf = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
    return { pick: pick || `${legs.length} legs`, confidence: conf };
  }

  if (hexaData.games) {
    return { pick: `${hexaData.games.length} games`, confidence: 0 };
  }

  return { pick: '', confidence: 0 };
}

// ── DB row → frontend entry ───────────────────────────────────────────────────

function dbRowToEntry(row) {
  return {
    id:                  row.id,
    date:                row.created_at,
    matchup:             row.matchup,
    mode:                row.type,
    pick:                row.pick,
    confidence:          row.oracle_confidence ?? 0,
    result:              row.result ?? 'pending',
    kelly_recommendation: row.kelly_recommendation ?? null,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export default function useHistory() {
  const { token, isAuthenticated } = useAuth();
  const [history, setHistory] = useState([]);

  // Load history on mount / when auth state changes
  const loadHistory = useCallback(() => {
    if (!isAuthenticated || !token) {
      setHistory(load());
      return;
    }

    fetch(`${import.meta.env.VITE_API_URL}/api/picks`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => {
        if (json.success) setHistory(json.data.map(dbRowToEntry));
      })
      .catch(() => {});
  }, [token, isAuthenticated]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── addPick ────────────────────────────────────────────────────────────────

  async function addPick(payload) {
    const hexaData             = payload?.result ?? null;
    const { pick, confidence } = extractPickAndConfidence(hexaData);
    const matchup              = extractMatchup(payload);

    const isSafe = !!hexaData?.safe_pick;

    if (!isAuthenticated || !token) {
      // Anonymous: persist to localStorage
      const entry = {
        id:         Date.now(),
        date:       payload.date ?? new Date().toISOString(),
        matchup,
        mode:       isSafe ? 'safe' : (payload.type ?? 'single'),
        pick,
        confidence,
        result:     'pending',
      };
      setHistory(prev => {
        const next = [entry, ...prev].slice(0, MAX_ENTRIES);
        save(next);
        return next;
      });
      return;
    }

    // Authenticated: POST to API
    const mp = hexaData?.master_prediction ?? {};
    const sp = hexaData?.safe_pick ?? null;

    // Extract odds for the pick
    let oddsAtPick = null;
    let oddsDetails = null;
    const oddsData = payload.odds;
    if (oddsData) {
      oddsAtPick = resolveFootballOdds(pick, matchup, oddsData, payload);
      oddsDetails = oddsData;
    }

    const body = {
      type:              isSafe ? 'safe' : (payload.type ?? 'single'),
      matchup,
      pick,
      oracle_confidence: confidence,
      bet_value:         mp.bet_value ?? null,
      model_risk:        mp.model_risk ?? mp.risk ?? (sp ? hexaData.model_risk : null) ?? null,
      oracle_report:     mp.oracle_report ?? (sp ? sp.reasoning : null) ?? null,
      hexa_hunch:        mp.hexa_hunch ?? null,
      alert_flags:       mp.alert_flags ?? hexaData?.alert_flags ?? [],
      probability_model: mp.probability_model ?? hexaData?.probability_model ?? {},
      best_pick:         mp.best_pick ?? (sp ? { type: sp.type, detail: sp.pick, confidence: sp.hit_probability / 100 } : {}) ?? {},
      model:             payload.model ?? null,
      language:          payload.language ?? 'en',
      kelly_recommendation: hexaData?.kelly_recommendation ?? null,
      odds_at_pick:      oddsAtPick ?? null,
      odds_details:      oddsDetails ? JSON.stringify(oddsDetails) : null,
    };

    try {
      const res  = await fetch(`${import.meta.env.VITE_API_URL}/api/picks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setHistory(prev => [dbRowToEntry(json.data), ...prev]);
      } else {
        console.error('[useHistory] POST /api/picks failed:', json);
      }
    } catch (err) {
      console.error('[useHistory] addPick network error:', err);
    }
  }

  // ── markResult ─────────────────────────────────────────────────────────────

  async function markResult(id, outcome) {
    if (!isAuthenticated || !token) {
      setHistory(prev => {
        const next = prev.map(e => e.id === id ? { ...e, result: outcome } : e);
        save(next);
        return next;
      });
      return;
    }

    try {
      const res  = await fetch(`${import.meta.env.VITE_API_URL}/api/picks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ result: outcome }),
      });
      const json = await res.json();
      if (json.success) {
        setHistory(prev => prev.map(e => e.id === id ? { ...e, result: outcome } : e));
      }
    } catch {
      // ignore
    }
  }

  // ── deletePick ─────────────────────────────────────────────────────────────

  async function deletePick(id) {
    if (!isAuthenticated || !token) {
      setHistory(prev => {
        const next = prev.filter(e => e.id !== id);
        save(next);
        return next;
      });
      return;
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/picks/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setHistory(prev => prev.filter(e => e.id !== id));
      }
    } catch {
      // ignore network errors
    }
  }

  // ── clearHistory ───────────────────────────────────────────────────────────

  async function clearHistory() {
    if (!isAuthenticated || !token) {
      setHistory([]);
      save([]);
      return;
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/picks`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setHistory([]);
      }
    } catch {
      // ignore network errors
    }
  }

  // ── getStats ───────────────────────────────────────────────────────────────

  function getStats() {
    const total    = history.length;
    const wins     = history.filter(e => e.result === 'win').length;
    const losses   = history.filter(e => e.result === 'loss').length;
    const pushes   = history.filter(e => e.result === 'push').length;
    const pending  = history.filter(e => e.result === 'pending').length;
    const resolved = wins + losses; // pushes excluded from win rate
    const winRate  = resolved > 0 ? Math.round((wins / resolved) * 100) : 0;
    return { total, wins, losses, pushes, pending, winRate };
  }

  return { history, addPick, markResult, deletePick, clearHistory, getStats, loadHistory };
}
