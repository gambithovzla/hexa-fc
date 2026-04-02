import axios from 'axios';

const API_KEY = process.env.API_FOOTBALL_KEY;

const axiosConfig = {
  headers: {
    'x-apisports-key': API_KEY,
    'x-rapidapi-host': 'v3.football.api-sports.io',
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

export async function getTodayMatches(dateStr) {
  try {
    const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: axiosConfig.headers,
      params: { date: dateStr },
    });

    const matches = response?.data?.response ?? [];
    const allowedLeagueIds = Object.values(SUPPORTED_LEAGUES);
    const filteredMatches = matches.filter(match => allowedLeagueIds.includes(match?.league?.id));

    return filteredMatches;
  } catch (error) {
    console.error('[soccer-api] getTodayMatches error:', error?.message ?? error);
    return [];
  }
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
