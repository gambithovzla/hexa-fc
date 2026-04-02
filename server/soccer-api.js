import axios from 'axios';

const API_BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY;

const axiosConfig = {
  baseURL: API_BASE_URL,
  headers: {
    'x-apisports-key': API_KEY,
  },
};

export const SUPPORTED_LEAGUES = {
  premierLeague: 39,
  laLiga: 140,
  serieA: 135,
  bundesliga: 78,
  championsLeague: 2,
  europaLeague: 3,
};

export const ODDS_API_MAP = {
  39: 'soccer_epl',
  140: 'soccer_spain_la_liga',
  135: 'soccer_italy_serie_a',
  78: 'soccer_germany_bundesliga',
  2: 'soccer_uefa_champs_league',
  3: 'soccer_uefa_europa_league',
};

export async function getTodayMatches(dateStr) {
  try {
    if (!API_KEY) {
      console.error('[soccer-api] Missing FOOTBALL_API_KEY.');
      return [];
    }

    const response = await axios.get(`${API_BASE_URL}/fixtures`, {
      headers: {
        'x-apisports-key': process.env.FOOTBALL_API_KEY,
      },
      params: { date: dateStr },
    });

    const matches = response?.data?.response ?? [];
    const allowedLeagueIds = Object.values(SUPPORTED_LEAGUES);
    const filteredMatches = matches.filter(match => allowedLeagueIds.includes(match?.league?.id));

    return filteredMatches;
  } catch (error) {
    console.error('[soccer-api] getTodayMatches error:', error?.message ?? error);
    if (error?.response?.status) {
      console.error('[soccer-api] HTTP status:', error.response.status);
    }
    if (error?.response?.data) {
      console.error('[soccer-api] API response data:', error.response.data);
    }
    return [];
  }
}

export async function getMatchById(matchId, dateStr) {
  if (!dateStr) dateStr = new Date().toISOString().split('T')[0];
  const matches = await getTodayMatches(dateStr);
  return matches.find(m => String(m.fixture.id) === String(matchId)) || null;
}

export async function getMatchLineups(fixtureId) {
  console.log(`[soccer-api] getMatchLineups stub for fixture ${fixtureId}`);
  return [];
}

export async function getTeamStats(teamId, leagueId, season) {
  console.log(`[soccer-api] getTeamStats stub for team=${teamId}, league=${leagueId}, season=${season}`);
  return {};
}

export { axios, API_KEY, axiosConfig };
