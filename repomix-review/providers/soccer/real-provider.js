import axios from 'axios';

import { createSoccerProvider } from './provider-interface.js';
import mockSoccerProvider from './mock-provider.js';
import { normalizeApiSportsMatch } from './normalizers.js';
import {
  buildNormalizedTeamStats,
  buildSeasonCandidates,
  getRecentCompletedFixtures,
  summarizeRecentTeamMetrics,
} from './stats-helpers.js';

const API_BASE_URL = 'https://v3.football.api-sports.io';
const SUPPORTED_LEAGUE_IDS = new Set([39, 140, 135, 78, 2, 3]);

const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_STATS_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRY_ATTEMPTS = 2;

const fixturesCache = new Map();
const statsCache = new Map();

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDate(dateStr) {
  return dateStr || new Date().toISOString().split('T')[0];
}

function getCacheTtlMs() {
  return toPositiveInt(process.env.SOCCER_FIXTURES_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);
}

function getTimeoutMs() {
  return toPositiveInt(process.env.SOCCER_REAL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function getStatsCacheTtlMs() {
  return toPositiveInt(process.env.SOCCER_STATS_CACHE_TTL_MS, DEFAULT_STATS_CACHE_TTL_MS);
}

function getRetryAttempts() {
  return toPositiveInt(process.env.SOCCER_REAL_RETRY_ATTEMPTS, DEFAULT_RETRY_ATTEMPTS);
}

function createApiClient() {
  return axios.create({
    baseURL: API_BASE_URL,
    timeout: getTimeoutMs(),
    headers: {
      'x-apisports-key': process.env.FOOTBALL_API_KEY,
    },
  });
}

function isRetryableError(error) {
  const status = error?.response?.status;
  return !status || status === 408 || status === 429 || status >= 500 || error?.code === 'ECONNABORTED';
}

function getBlockingApiError(response) {
  const errors = response?.data?.errors;
  if (!errors || Object.keys(errors).length === 0) return null;

  const firstMessage = Object.values(errors).find(Boolean);
  return typeof firstMessage === 'string' ? firstMessage : 'Unknown upstream error';
}

async function requestWithRetry(pathname, params, label) {
  if (!process.env.FOOTBALL_API_KEY) {
    throw new Error('Missing FOOTBALL_API_KEY');
  }

  const apiClient = createApiClient();
  let lastError = null;

  for (let attempt = 1; attempt <= getRetryAttempts(); attempt += 1) {
    try {
      const response = await apiClient.get(pathname, { params });
      const blockingError = getBlockingApiError(response);

      if (blockingError) {
        throw new Error(blockingError);
      }

      return response;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      const status = error?.response?.status;
      console.warn(
        `[soccer-provider:real] ${label} failed on attempt ${attempt}/${getRetryAttempts()}`
        + `${status ? ` (status ${status})` : ''}: ${error?.message ?? error}`,
      );

      if (!retryable || attempt === getRetryAttempts()) {
        break;
      }
    }
  }

  throw lastError;
}

function getCachedMatches(cacheKey) {
  const entry = fixturesCache.get(cacheKey);
  if (!entry) {
    console.log(`[soccer-provider:real] cache miss for ${cacheKey}`);
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    fixturesCache.delete(cacheKey);
    console.log(`[soccer-provider:real] cache miss for ${cacheKey} (expired)`);
    return null;
  }

  console.log(`[soccer-provider:real] cache hit for ${cacheKey} (${entry.source})`);
  return entry.data;
}

function setCachedMatches(cacheKey, matches, source) {
  fixturesCache.set(cacheKey, {
    data: matches,
    source,
    expiresAt: Date.now() + getCacheTtlMs(),
  });
}

function getCachedStats(cacheKey) {
  const entry = statsCache.get(cacheKey);
  if (!entry) {
    console.log(`[soccer-provider:real] stats cache miss for ${cacheKey}`);
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    statsCache.delete(cacheKey);
    console.log(`[soccer-provider:real] stats cache miss for ${cacheKey} (expired)`);
    return null;
  }

  console.log(`[soccer-provider:real] stats cache hit for ${cacheKey} (${entry.source})`);
  return entry.data;
}

function setCachedStats(cacheKey, data, source) {
  statsCache.set(cacheKey, {
    data,
    source,
    expiresAt: Date.now() + getStatsCacheTtlMs(),
  });
}

async function fetchFixturesForDate(dateStr) {
  const response = await requestWithRetry('/fixtures', { date: dateStr }, `fixtures ${dateStr}`);
  const matches = response?.data?.response ?? [];
  return matches.filter((match) => SUPPORTED_LEAGUE_IDS.has(match?.league?.id));
}

async function fetchSeasonFixtures(teamId, leagueId, season) {
  const response = await requestWithRetry(
    '/fixtures',
    { team: teamId, league: leagueId, season },
    `season fixtures team=${teamId} league=${leagueId} season=${season}`,
  );
  return response?.data?.response ?? [];
}

async function fetchTeamStatistics(teamId, leagueId, season) {
  const response = await requestWithRetry(
    '/teams/statistics',
    { team: teamId, league: leagueId, season },
    `team statistics team=${teamId} league=${leagueId} season=${season}`,
  );
  return response?.data?.response ?? null;
}

async function fetchFixtureStatistics(fixtureId) {
  const response = await requestWithRetry(
    '/fixtures/statistics',
    { fixture: fixtureId },
    `fixture statistics fixture=${fixtureId}`,
  );
  return response?.data?.response ?? [];
}

async function fetchRecentFixtureStatisticsBestEffort(recentFixtures) {
  const statisticsByFixture = [];

  for (const item of recentFixtures) {
    const fixtureId = item?.fixture?.fixture?.id;
    if (!fixtureId) {
      statisticsByFixture.push([]);
      continue;
    }

    try {
      const fixtureStats = await fetchFixtureStatistics(fixtureId);
      statisticsByFixture.push(fixtureStats);
    } catch (error) {
      console.warn(
        `[soccer-provider:real] proceeding without fixture statistics for ${fixtureId}: ${error?.message ?? error}`,
      );
      statisticsByFixture.push([]);
    }
  }

  return statisticsByFixture;
}

async function getTodayMatches(dateStr) {
  const resolvedDate = resolveDate(dateStr);
  const cacheKey = `fixtures:${resolvedDate}`;
  const cachedMatches = getCachedMatches(cacheKey);
  if (cachedMatches) return cachedMatches;

  try {
    const rawMatches = await fetchFixturesForDate(resolvedDate);
    const matches = rawMatches.map(normalizeApiSportsMatch);
    console.log(`[soccer-provider:real] fetched ${matches.length} real matches for ${resolvedDate}`);
    setCachedMatches(cacheKey, matches, 'real');
    return matches;
  } catch (error) {
    console.warn(`[soccer-provider:real] falling back to mock for ${resolvedDate}: ${error?.message ?? error}`);
    const fallbackMatches = await mockSoccerProvider.getTodayMatches(resolvedDate);
    setCachedMatches(cacheKey, fallbackMatches, 'mock-fallback');
    return fallbackMatches;
  }
}

const realSoccerProvider = createSoccerProvider({
  getTodayMatches,

  async getMatchById(matchId, dateStr) {
    try {
      const response = await requestWithRetry('/fixtures', { id: matchId }, `fixture ${matchId}`);
      const rawMatch = response?.data?.response?.[0] ?? null;

      if (rawMatch) {
        if (!SUPPORTED_LEAGUE_IDS.has(rawMatch?.league?.id)) {
          console.warn(
            `[soccer-provider:real] fixture ${matchId} is outside the supported leagues`
            + ` (${rawMatch?.league?.id ?? 'unknown'})`,
          );
        }
        return normalizeApiSportsMatch(rawMatch);
      }
    } catch (error) {
      console.warn(`[soccer-provider:real] getMatchById fallback for ${matchId}: ${error?.message ?? error}`);
    }

    const resolvedDate = resolveDate(dateStr);
    const matches = await getTodayMatches(resolvedDate);
    return matches.find((match) => String(match.matchId ?? match.fixture?.id) === String(matchId)) || null;
  },

  async getMatchLineups(fixtureId) {
    console.log(`[soccer-provider:real] getMatchLineups not implemented yet for fixture ${fixtureId}; returning mock stub.`);
    return mockSoccerProvider.getMatchLineups(fixtureId);
  },

  async getTeamStats(teamId, leagueId, season) {
    const cacheKey = `team-stats:${teamId}:${leagueId}:${season ?? 'auto'}`;
    const cachedStats = getCachedStats(cacheKey);
    if (cachedStats) return cachedStats;

    const seasonCandidates = buildSeasonCandidates(season);
    let lastError = null;

    for (const candidateSeason of seasonCandidates) {
      try {
        const [apiStats, seasonFixtures] = await Promise.all([
          fetchTeamStatistics(teamId, leagueId, candidateSeason),
          fetchSeasonFixtures(teamId, leagueId, candidateSeason),
        ]);

        if (!apiStats) {
          throw new Error(`No statistics returned for season ${candidateSeason}`);
        }

        const recentFixtures = getRecentCompletedFixtures(seasonFixtures, teamId, 5);
        const recentStatsResponses = await fetchRecentFixtureStatisticsBestEffort(recentFixtures);

        const recentMetrics = summarizeRecentTeamMetrics(
          recentFixtures.map((item, index) => ({
            fixture: item.fixture,
            statistics: recentStatsResponses[index],
          })),
          teamId,
        );

        const normalizedStats = buildNormalizedTeamStats({
          apiStats,
          recentFixtures,
          recentMetrics,
          teamId,
          leagueId,
          season: candidateSeason,
        });

        setCachedStats(cacheKey, normalizedStats, `real:${candidateSeason}`);
        console.log(
          `[soccer-provider:real] fetched team stats for team=${teamId}, league=${leagueId}, season=${candidateSeason}`
          + ` (requested=${season ?? 'auto'})`,
        );
        return normalizedStats;
      } catch (error) {
        lastError = error;
        console.warn(
          `[soccer-provider:real] getTeamStats attempt failed for team=${teamId}, league=${leagueId}, season=${candidateSeason}:`
          + ` ${error?.message ?? error}`,
        );
      }
    }

    console.warn(
      `[soccer-provider:real] getTeamStats falling back to mock for team=${teamId}, league=${leagueId}, season=${season ?? 'auto'}:`
      + ` ${lastError?.message ?? lastError ?? 'unknown error'}`,
    );
    const fallbackStats = await mockSoccerProvider.getTeamStats(teamId, leagueId, season);
    setCachedStats(cacheKey, fallbackStats, 'mock-fallback');
    return fallbackStats;
  },
});

export default realSoccerProvider;
