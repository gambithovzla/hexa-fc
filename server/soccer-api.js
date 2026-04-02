import axios from 'axios';
import soccerProvider from './providers/soccer/index.js';

const API_BASE_URL = 'https://v3.football.api-sports.io';

const axiosConfig = {
  baseURL: API_BASE_URL,
  headers: {
    'x-apisports-key': process.env.FOOTBALL_API_KEY,
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

// Keep the public API stable while providers handle the data source details.
export async function getTodayMatches(dateStr) {
  return soccerProvider.getTodayMatches(dateStr);
}

export async function getMatchById(matchId, dateStr) {
  return soccerProvider.getMatchById(matchId, dateStr);
}

export async function getMatchLineups(fixtureId) {
  return soccerProvider.getMatchLineups(fixtureId);
}

export async function getTeamStats(teamId, leagueId, season) {
  return soccerProvider.getTeamStats(teamId, leagueId, season);
}

export { axios, axiosConfig };
