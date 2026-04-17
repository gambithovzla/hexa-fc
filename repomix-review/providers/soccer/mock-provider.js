import { readFile } from 'fs/promises';

import { createSoccerProvider } from './provider-interface.js';
import { normalizeMockMatch } from './normalizers.js';

const MOCK_MATCHES_PATH = new URL('../../mock-matches.json', import.meta.url);

async function loadMockMatches() {
  const fileContents = await readFile(MOCK_MATCHES_PATH, 'utf8');
  return JSON.parse(fileContents);
}

async function getTodayMatches(dateStr) {
  try {
    const rawMatches = await loadMockMatches();
    const matches = rawMatches.map(normalizeMockMatch);
    console.log(`[soccer-api] Returning ${matches.length} normalized mock matches for ${dateStr ?? 'default date'}.`);
    return matches;
  } catch (error) {
    console.error('[soccer-api] getTodayMatches error:', error?.message ?? error);
    return [];
  }
}

const mockSoccerProvider = createSoccerProvider({
  getTodayMatches,

  async getMatchById(matchId, dateStr) {
    const resolvedDate = dateStr || new Date().toISOString().split('T')[0];
    const matches = await getTodayMatches(resolvedDate);
    return matches.find((match) => String(match.matchId ?? match.fixture?.id) === String(matchId)) || null;
  },

  async getMatchLineups(fixtureId) {
    console.log(`[soccer-api] getMatchLineups stub for fixture ${fixtureId}`);
    return [];
  },

  async getTeamStats(teamId, leagueId, season) {
    console.log(`[soccer-api] getTeamStats stub for team=${teamId}, league=${leagueId}, season=${season}`);
    return {};
  },
});

export default mockSoccerProvider;
