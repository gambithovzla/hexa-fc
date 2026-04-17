const REQUIRED_PROVIDER_METHODS = [
  'getTodayMatches',
  'getMatchById',
  'getMatchLineups',
  'getTeamStats',
];

/**
 * @typedef {Object} SoccerProvider
 * @property {(dateStr?: string) => Promise<Array>} getTodayMatches Returns matches for a given date.
 * @property {(matchId: string | number, dateStr?: string) => Promise<Object | null>} getMatchById Returns one match or null.
 * @property {(fixtureId: string | number) => Promise<Array>} getMatchLineups Returns lineup data for a fixture.
 * @property {(teamId: string | number, leagueId: string | number, season: string | number) => Promise<Object>} getTeamStats Returns team stats for a competition context.
 */

/**
 * Validates that a provider implements the soccer data contract.
 * Future providers can reuse this to fail fast during boot.
 *
 * @param {Partial<SoccerProvider>} provider
 * @returns {SoccerProvider}
 */
export function createSoccerProvider(provider) {
  for (const methodName of REQUIRED_PROVIDER_METHODS) {
    if (typeof provider?.[methodName] !== 'function') {
      throw new Error(`[soccer-provider] Missing required method: ${methodName}`);
    }
  }

  return /** @type {SoccerProvider} */ (provider);
}

export { REQUIRED_PROVIDER_METHODS };
