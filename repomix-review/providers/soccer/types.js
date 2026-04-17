/**
 * H.E.X.A. F.C. internal soccer match model.
 *
 * This file documents the normalized shape that every future provider should
 * produce before exposing data to the rest of the app.
 *
 * During the migration, providers may return a hybrid object:
 * - Top-level H.E.X.A. fields are the source of truth.
 * - Legacy fields remain available for existing consumers.
 *
 * Legacy compatibility fields that are intentionally preserved for now:
 * - id
 * - gamePk
 * - gameDate
 * - lineupStatus
 * - fixture.*
 * - league.*
 * - teams.*
 * - goals.*
 */

/**
 * @typedef {Object} HexaSoccerStatus
 * @property {string} short Internal short status code such as NS, LIVE or FT.
 * @property {string} long Human-readable status label.
 * @property {string | null} phase Optional stage label when the source provides one.
 * @property {boolean} isLive Whether the match is currently in progress.
 * @property {boolean} isFinished Whether the match is finished.
 */

/**
 * @typedef {Object} HexaSoccerCompetition
 * @property {string | number | null} id
 * @property {string | null} name
 * @property {string | null} shortName
 * @property {string | null} country
 */

/**
 * @typedef {Object} HexaSoccerVenue
 * @property {string | number | null} id
 * @property {string | null} name
 * @property {string | null} city
 */

/**
 * @typedef {Object} HexaSoccerTeam
 * @property {string | number | null} id
 * @property {string} name
 * @property {string | null} shortName
 * @property {string | null} logo
 */

/**
 * @typedef {Object} HexaSoccerScore
 * @property {number | null} home
 * @property {number | null} away
 */

/**
 * @typedef {Object} HexaSoccerMatch
 * @property {string | number | null} matchId Stable internal match identifier.
 * @property {string} source Provider source key.
 * @property {HexaSoccerCompetition} competition Normalized competition info.
 * @property {string | number | null} season Source season when available.
 * @property {string | null} date ISO date string for kickoff.
 * @property {HexaSoccerStatus} status Normalized status object.
 * @property {HexaSoccerVenue} venue Normalized venue object.
 * @property {HexaSoccerTeam} homeTeam Normalized home team.
 * @property {HexaSoccerTeam} awayTeam Normalized away team.
 * @property {HexaSoccerScore} score Normalized scoreboard.
 * @property {Object} metrics Placeholder for future team metrics.
 * @property {Object} context Placeholder for future context metadata.
 * @property {Object} odds Placeholder for future odds data.
 * @property {Object} sourceMeta Provider-specific metadata.
 */

/**
 * @typedef {Object} HexaSoccerFormSnapshot
 * @property {number} matchesPlayed
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} goalsFor
 * @property {number} goalsAgainst
 */

/**
 * @typedef {Object} HexaSoccerTrendMetric
 * @property {number | null} for Average or aggregate value for the team.
 * @property {number | null} against Average or aggregate value conceded by the team.
 * @property {number} sampleSize Number of recent fixtures used to compute the metric.
 */

/**
 * @typedef {Object} HexaSoccerTeamStats
 * @property {string} source Provider source key.
 * @property {string | number | null} teamId
 * @property {string | number | null} leagueId
 * @property {string | number | null} season
 * @property {string | null} teamName
 * @property {string | null} teamShortName
 * @property {string | null} teamLogo
 * @property {number} matchesPlayed
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} goalsFor
 * @property {number} goalsAgainst
 * @property {string} formLast5 Most recent five results, newest first.
 * @property {HexaSoccerFormSnapshot} homeForm
 * @property {HexaSoccerFormSnapshot} awayForm
 * @property {HexaSoccerTrendMetric} shots
 * @property {HexaSoccerTrendMetric} shotsOnTarget
 * @property {number | null} xg Average expected goals for across the recent sample.
 * @property {number | null} xga Average expected goals against across the recent sample.
 * @property {Object} sourceMeta Provider-specific metadata for fallback/debugging.
 */

export const HEXA_SOCCER_MODEL_VERSION = 1;
