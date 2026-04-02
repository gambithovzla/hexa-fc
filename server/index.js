import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { buildMatchContext } from './context-builder.js';
import { analyzeGame, analyzeParlay, analyzeSafe, analyzeChat } from './oracle.js';
import { getOdds, getGameOdds, matchOddsToGame, calculateImpliedProbability } from './odds-api.js';
import authRouter, { bankrollRouter, seedAdminUser } from './auth.js';
import { verifyToken } from './middleware/auth-middleware.js';
import { runMigrations } from './migrate.js';
import pool from './db.js';
import lemonRouter from './lemon.js';
import picksRouter from './routes/picks.js';
import { handleBMCWebhook } from './bmc-webhook.js';
import { resolvePendingPicks } from './pick-resolver.js';
import { captureClosingLines } from './closing-line-capture.js';
import { captureOddsSnapshot, getLineMovement } from './line-movement.js';
import { getTodayMatches, getMatchById, SUPPORTED_LEAGUES, ODDS_API_MAP } from './soccer-api.js';

console.log('--- DEBUG ENTORNO ---');
console.log('Ruta ejecuciÃ³n:', process.cwd());
console.log('Llave Football:', process.env.FOOTBALL_API_KEY ? 'Detectada (OK)' : 'NO DETECTADA');
console.log('Llave Odds:', process.env.ODDS_API_KEY ? 'Detectada (OK)' : 'NO DETECTADA');
console.log('---------------------');

// Temporary compatibility shims while other endpoints are migrated to football context.
const buildContext = buildMatchContext;
const buildContextById = async (id) => {
  const match = await getMatchById(id);
  if (!match) {
    throw new Error(`Match ${id} not found`);
  }
  return buildMatchContext(match);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // eslint-disable-line no-unused-vars

// Ã¢â€â‚¬Ã¢â€â‚¬ Safe error helper Ã¢â‚¬â€ never leak internal details to client Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function safeError(err) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[H.E.X.A. Error]', err.message, err.stack?.split('\n')[1]);
    return 'Internal server error';
  }
  return err.message;
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Ã¢â€â‚¬Ã¢â€â‚¬ CORS: strict origin (must be first) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.use(cors({
  origin: ['https://hexaoracle.lat', 'https://www.hexaoracle.lat', 'http://localhost:5173', /\.vercel\.app$/],
  credentials: true,
}));

// Ã¢â€â‚¬Ã¢â€â‚¬ Security: HTTP headers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://hexaoracle.lat", "https://www.hexaoracle.lat", "https://hexa-v4-production.up.railway.app"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Ã¢â€â‚¬Ã¢â€â‚¬ Rate limiting: 100 req / 15 min per IP (webhooks exempt) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path.startsWith('/api/lemon/webhook') ||
    req.path.startsWith('/api/bmc/webhook'),
});
app.use(limiter);

// Ã¢â€â‚¬Ã¢â€â‚¬ Strict rate limiting for analysis endpoints (consume Anthropic API) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 10,               // max 10 analysis requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many analysis requests. Please wait a moment.' },
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Body parsers (raw must come before json for webhook routes) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.use('/api/lemon/webhook', express.raw({ type: 'application/json' }));
app.use('/api/bmc/webhook',   express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

// Ã¢â€â‚¬Ã¢â€â‚¬ Auth routes Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.use('/api/auth',      authRouter);
app.use('/api/bankroll',  bankrollRouter);
app.use('/api/lemon',     lemonRouter);
app.use('/api/picks',     picksRouter);
app.post('/api/bmc/webhook', handleBMCWebhook);

// Ã¢â€â‚¬Ã¢â€â‚¬ Credit helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const CREDIT_COSTS = {
  single:  { fast: 1,  deep: 2  },
  parlay:  { fast: 4,  deep: 8  },
};
const WEB_INTEL_COST = 3; // only applied to single-game

function calcServerCost(type, model, webSearch) {
  const base = CREDIT_COSTS[type]?.[model] ?? 1;
  const webBonus = (type === 'single' && webSearch) ? WEB_INTEL_COST : 0;
  return base + webBonus;
}

/**
 * deductCredits(req, res, cost)
 * Looks up the user in PostgreSQL, checks credits, deducts `cost` atomically.
 * Admin account bypasses deduction entirely.
 * Returns the updated user row, or null after sending an error response.
 */
async function deductCredits(req, res, cost) {
  const { rows } = await pool.query(
    'SELECT id, email, credits FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  // Admin account bypasses credit deduction
  if (user.email === 'cdanielrr@hotmail.com') return user;
  if (user.credits < cost) {
    res.status(403).json({ error: 'No credits remaining' });
    return null;
  }
  const updated = await pool.query(
    'UPDATE users SET credits = credits - $1 WHERE id = $2 RETURNING id, email, credits',
    [cost, user.id]
  );
  return updated.rows[0];
}

/**
 * refundCredits(userId, cost, email)
 * Adds `cost` credits back to the user account.
 * Admin accounts are skipped (they were never charged).
 */
async function refundCredits(userId, cost, email) {
  if (email === 'cdanielrr@hotmail.com') return;
  try {
    await pool.query(
      'UPDATE users SET credits = credits + $1 WHERE id = $2',
      [cost, String(userId)]
    );
    console.log(`[Credits] Refunding ${cost} credits to user ${userId} due to analysis failure`);
  } catch (err) {
    console.error(`[Credits] Refund failed for user ${userId}:`, err.message);
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Admin middleware Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function isAdmin(req, res, next) {
  if (req.user.email !== 'cdanielrr@hotmail.com') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// GET /api/matches?date=YYYY-MM-DD
app.get('/api/matches', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const matches = await getTodayMatches(date);
    res.json(matches);
  } catch (err) {
    console.error('[matches] Error fetching matches:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch matches' });
  }
});

// GET /api/odds/today
app.get('/api/odds/today', async (req, res) => {
  try {
    const leagueId = Number(req.query.leagueId);
    const odds = await getOdds(Number.isFinite(leagueId) ? leagueId : null);
    res.json({ success: true, data: odds });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/leagues
app.get('/api/leagues', (_req, res) => {
  res.json(SUPPORTED_LEAGUES);
});

// GET /api/games/:gameId/context  Ã¢â‚¬â€ devuelve el contexto en texto plano
app.get('/api/games/:gameId/context', verifyToken, async (req, res) => {
  try {
    const context = await buildContextById(req.params.gameId);
    res.json({ success: true, data: context });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/analyze/game  Ã¢â‚¬â€ requires auth, costs 1 (fast) or 2 (deep) + 3 if webSearch
app.post('/api/analyze/game', analysisLimiter, verifyToken, async (req, res) => {
  const id = req.body.gameId || req.body.matchId;
  const {
    language    = 'en',
    lang,
    betType,
    riskProfile = 'medium',
    webSearch   = false,
    model       = 'fast',
  } = req.body;
  const date         = req.body.date || new Date().toISOString().split('T')[0];
  // Input validation
  if (!id) return res.status(400).json({ success: false, error: 'matchId (or gameId) is required' });
  if (model && !['fast', 'deep'].includes(model)) return res.status(400).json({ success: false, error: 'Invalid model' });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, error: 'Invalid date format' });
  const resolvedLang = lang ?? language;
  const cost         = calcServerCost('single', model, webSearch);

  try {
    const match = await getMatchById(id, date);
    if (!match) {
      return res.status(404).json({ success: false, error: `Partido ${id} no encontrado` });
    }

    let matchedOdds = null;
    const leagueId = Number(match?.league?.id);
    const sportKey = ODDS_API_MAP[leagueId];

    if (sportKey) {
      try {
        const allOdds = await getOdds(leagueId);
        matchedOdds = matchOddsToGame(allOdds, match?.teams?.home?.name, match?.teams?.away?.name);
      } catch (oddsError) {
        console.warn('[analyze/game] odds fetch failed:', oddsError?.message ?? oddsError);
      }
    }

    const prompt = await buildMatchContext(match, matchedOdds);

    const updatedUser = await deductCredits(req, res, cost);
    if (!updatedUser) return;

    // Fetch user bankroll for Kelly Criterion calculation
    let userBankroll = null;
    try {
      const brResult = await pool.query(
        'SELECT current_bankroll FROM bankroll WHERE user_id = $1',
        [req.user.id]
      );
      if (brResult.rows.length > 0) {
        userBankroll = parseFloat(brResult.rows[0].current_bankroll);
      }
    } catch { /* bankroll is optional Ã¢â‚¬â€ never block the analysis */ }

    let analysis;
    try {
      const matchup = `${match.teams?.away?.name ?? 'Away'} @ ${match.teams?.home?.name ?? 'Home'}`;

      analysis = await analyzeGame({
        matchup, betType, context: prompt, riskProfile,
        mode: 'single', lang: resolvedLang, webSearch, model, timeoutMs: 90000,
        userBankroll,
        matchId: id,
      });
    } catch (err) {
      await refundCredits(updatedUser.id, cost, updatedUser.email);
      const isTimeout = err.message === 'TIMEOUT';
      return res.status(500).json({
        success: false,
        error: isTimeout
          ? 'El anÃƒÂ¡lisis tardÃƒÂ³ demasiado. CrÃƒÂ©ditos reembolsados. Por favor reintenta.'
          : 'AnÃƒÂ¡lisis fallido. Tus crÃƒÂ©ditos han sido reembolsados.',
      });
    }

    const responseData = analysis.data ? { ...analysis.data } : null;
    res.json({ success: true, data: responseData, parseError: analysis.parseError, rawText: analysis.rawText, credits: updatedUser.credits });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/analyze/parlay  Ã¢â‚¬â€ requires auth, costs 4 (fast) or 8 (deep) credits
app.post('/api/analyze/parlay', analysisLimiter, verifyToken, async (req, res) => {
  const {
    gameIds,
    language    = 'en',
    lang,
    betType,
    riskProfile = 'medium',
    webSearch   = false,
    parlayLegs,
    model       = 'fast',
  } = req.body;
  const date         = req.body.date || new Date().toISOString().split('T')[0];
  // Input validation
  if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) return res.status(400).json({ success: false, error: 'gameIds array is required' });
  if (gameIds.length > 10) return res.status(400).json({ success: false, error: 'Maximum 10 games per parlay' });
  if (model && !['fast', 'deep'].includes(model)) return res.status(400).json({ success: false, error: 'Invalid model' });
  const resolvedLang = lang ?? language;
  const cost         = calcServerCost('parlay', model, false);

  try {
    const games = await getTodayMatches(date);

    let allOdds = [];
    try { allOdds = await getGameOdds(); } catch { /* optional */ }

    const legOddsArr = gameIds.map(id => {
      const gameData = games.find(g => String(g.gamePk) === String(id));
      if (!gameData) return null;
      return matchOddsToGame(allOdds, gameData.teams?.home?.name, gameData.teams?.away?.name);
    });

    const updatedUser = await deductCredits(req, res, cost);
    if (!updatedUser) return;

    let analysis;
    try {
      const contexts = await Promise.all(
        gameIds.map(async (id, i) => {
          const gameData = games.find(g => String(g.gamePk) === String(id));
          if (!gameData) throw new Error(`Partido ${id} no encontrado`);
          return buildContext(gameData, legOddsArr[i] ?? null);
        })
      );
      analysis = await analyzeParlay(contexts, resolvedLang, { betType, riskProfile, webSearch, legs: parlayLegs, model, timeoutMs: 90000 });
    } catch (err) {
      await refundCredits(updatedUser.id, cost, updatedUser.email);
      const isTimeout = err.message === 'TIMEOUT';
      return res.status(500).json({
        success: false,
        error: isTimeout
          ? 'El anÃƒÂ¡lisis tardÃƒÂ³ demasiado. CrÃƒÂ©ditos reembolsados. Por favor reintenta.'
          : 'AnÃƒÂ¡lisis fallido. Tus crÃƒÂ©ditos han sido reembolsados.',
      });
    }

    const responseData = analysis.data
      ? { ...analysis.data, legOdds: legOddsArr.some(Boolean) ? legOddsArr : undefined }
      : null;
    res.json({ success: true, data: responseData, parseError: analysis.parseError, rawText: analysis.rawText, credits: updatedUser.credits });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/analyze/safe Ã¢â‚¬â€ Safe Pick mode (supports single gameId or multiple gameIds for parlay safe picks)
app.post('/api/analyze/safe', analysisLimiter, verifyToken, async (req, res) => {
  const { gameId, gameIds, lang = 'en', date } = req.body;
  const resolvedDate = date || new Date().toISOString().split('T')[0];

  // Determine if this is a multi-game safe pick request
  const ids = gameIds && Array.isArray(gameIds) && gameIds.length > 0
    ? gameIds
    : gameId ? [gameId] : [];

  if (ids.length === 0) {
    return res.status(400).json({ success: false, error: 'gameId or gameIds is required' });
  }

  // Cost: 2 credits per game
  const cost = 2 * ids.length;
  const isMulti = ids.length > 1;

  try {
    let games = await getTodayMatches(resolvedDate);

    // Fallback: try today if requested date returned nothing
    if (games.length === 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (todayStr !== resolvedDate) {
        games = await getTodayMatches(todayStr);
      }
    }

    let allOdds = [];
    try { allOdds = await getGameOdds(); } catch { /* optional */ }

    const updatedUser = await deductCredits(req, res, cost);
    if (!updatedUser) return;

    // Analyze each game individually in parallel
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const gameData = games.find(g => String(g.gamePk) === String(id));
        if (!gameData) return { gameId: id, error: `Game ${id} not found` };

        let matchedOdds = null;
        try {
          matchedOdds = matchOddsToGame(allOdds, gameData.teams?.home?.name, gameData.teams?.away?.name);
        } catch { /* optional */ }

        try {
          const contextString = await buildContext(gameData, matchedOdds);
          const analysis = await analyzeSafe({ contextString, lang });

          const homeAbbr = gameData.teams?.home?.abbreviation ?? 'HOME';
          const awayAbbr = gameData.teams?.away?.abbreviation ?? 'AWAY';

          return {
            gameId: id,
            matchup: `${awayAbbr} @ ${homeAbbr}`,
            data: analysis.data,
            rawText: analysis.rawText,
            parseError: analysis.parseError,
            odds: matchedOdds ?? undefined,
          };
        } catch (err) {
          return {
            gameId: id,
            matchup: `Game ${id}`,
            error: err.message === 'TIMEOUT' ? 'Analysis timed out' : err.message,
          };
        }
      })
    );

    const processedResults = results.map(r =>
      r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? 'Unknown error' }
    );

    const successCount = processedResults.filter(r => r.data && !r.error).length;
    const failCount = processedResults.filter(r => r.error).length;

    // If any failed, refund those credits
    if (failCount > 0) {
      await refundCredits(updatedUser.id, failCount * 2, updatedUser.email);
    }

    // For single game (backward compatible), return the old format
    if (!isMulti) {
      const single = processedResults[0];
      if (single.error) {
        return res.status(500).json({ success: false, error: single.error });
      }
      return res.json({
        success: true,
        data: single.data,
        odds: single.odds ?? null,
        parseError: single.parseError,
        rawText: single.rawText,
        credits: updatedUser.credits - (failCount * 2),
        mode: 'safe',
      });
    }

    // Multi-game: return array of results
    res.json({
      success: true,
      data: {
        mode: 'safe_multi',
        results: processedResults,
        summary: { total: ids.length, analyzed: successCount, failed: failCount },
      },
      credits: updatedUser.credits - (failCount * 2),
      mode: 'safe',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/admin/grant-credits Ã¢â‚¬â€ Manually add credits to a user (admin only)
app.post('/api/admin/grant-credits', verifyToken, isAdmin, async (req, res) => {
  const { email, amount } = req.body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'email is required' });
  }
  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: 'amount is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero integer' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE users SET credits = credits + $2 WHERE email = $1 RETURNING credits',
      [email.toLowerCase().trim(), parsedAmount]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `User with email '${email}' not found` });
    }

    console.log(`[Admin] Granted ${parsedAmount} credits to ${email}. New balance: ${rows[0].credits}`);
    res.json({ success: true, email: email.toLowerCase().trim(), credits: rows[0].credits });
  } catch (err) {
    console.error('[Admin] grant-credits error:', err.message);
    res.status(500).json({ error: 'Failed to update credits', details: safeError(err) });
  }
});

// POST /api/analyze/batch Ã¢â‚¬â€ Admin Batch Scan: analyze multiple games individually in parallel
app.post('/api/analyze/batch', analysisLimiter, verifyToken, isAdmin, async (req, res) => {
  const { gameIds, lang = 'es', date } = req.body;

  // Input validation
  if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
    return res.status(400).json({ success: false, error: 'gameIds array is required' });
  }
  if (gameIds.length > 16) {
    return res.status(400).json({ success: false, error: 'Maximum 16 games per batch scan' });
  }

  const resolvedDate = date || new Date().toISOString().split('T')[0];

  try {
    const games = await getTodayMatches(resolvedDate);

    let allOdds = [];
    try { allOdds = await getGameOdds(); } catch { /* optional */ }

    // Build context for each game
    const gameContexts = await Promise.all(
      gameIds.map(async (id) => {
        const gameData = games.find(g => String(g.gamePk) === String(id));
        if (!gameData) return { id, error: `Game ${id} not found` };

        let matchedOdds = null;
        try {
          matchedOdds = matchOddsToGame(allOdds, gameData.teams?.home?.name, gameData.teams?.away?.name);
        } catch { /* optional */ }

        try {
          const contextString = await buildContext(gameData, matchedOdds);
          const homeAbbr = gameData.teams?.home?.abbreviation ?? 'HOME';
          const awayAbbr = gameData.teams?.away?.abbreviation ?? 'AWAY';
          return {
            id,
            gameData,
            contextString,
            matchedOdds,
            matchup: `${awayAbbr} @ ${homeAbbr}`,
          };
        } catch (err) {
          return { id, error: `Context build failed: ${err.message}` };
        }
      })
    );

    // Analyze games in batches of 3 to avoid Anthropic API rate limits (30k tokens/min)
    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 5000; // 5 seconds between batches
    const allResults = [];

    for (let i = 0; i < gameContexts.length; i += BATCH_SIZE) {
      const batch = gameContexts.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(gameContexts.length / BATCH_SIZE);
      console.log(`[Admin Batch] Processing batch ${batchNum}/${totalBatches} (${batch.length} games)`);

      const batchResults = await Promise.allSettled(
        batch.map(async (ctx) => {
          if (ctx.error) return { matchup: `Game ${ctx.id}`, error: ctx.error };

          try {
            const analysis = await analyzeGame({
              mode: 'single',
              matchup: ctx.matchup,
              context: ctx.contextString,
              lang,
              betType: 'all',
              riskProfile: 'balanced',
              webSearch: false,
              model: 'deep',
              timeoutMs: 120000,
            });

            return {
              gameId: ctx.id,
              matchup: ctx.matchup,
              data: analysis.data,
              rawText: analysis.rawText,
              parseError: analysis.parseError,
              odds: ctx.matchedOdds ?? undefined,
            };
          } catch (err) {
            return {
              gameId: ctx.id,
              matchup: ctx.matchup,
              error: err.message === 'TIMEOUT' ? 'Analysis timed out' : err.message,
            };
          }
        })
      );

      allResults.push(...batchResults);

      // Wait between batches to respect rate limits (skip delay after last batch)
      if (i + BATCH_SIZE < gameContexts.length) {
        console.log(`[Admin Batch] Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const results = allResults;

    // Process results and auto-save picks
    const processedResults = [];

    for (const result of results) {
      const value = result.status === 'fulfilled' ? result.value : { error: result.reason?.message ?? 'Unknown error' };

      if (value.error) {
        processedResults.push(value);
        continue;
      }

      // Auto-save pick to database
      if (value.data && !value.parseError) {
        try {
          const d = value.data;
          const mp = d.master_prediction ?? d.safe_pick ?? {};
          const bp = d.best_pick ?? {};

          const oddsAtPick = value.odds?.moneyline?.home ?? value.odds?.moneyline?.away ?? null;
          const impliedProbAtPick = oddsAtPick != null
            ? (oddsAtPick < 0
                ? Math.abs(oddsAtPick) / (Math.abs(oddsAtPick) + 100)
                : 100 / (oddsAtPick + 100))
            : null;

          const pickResult = await pool.query(
            `INSERT INTO picks (user_id, type, matchup, pick, oracle_confidence, bet_value,
             model_risk, oracle_report, hexa_hunch, alert_flags, probability_model, best_pick,
             model, language, odds_at_pick, implied_prob_at_pick, odds_details)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING id`,
            [
              req.user.id,
              'batch',
              value.matchup,
              mp.pick ?? bp.detail ?? null,
              mp.oracle_confidence ?? null,
              mp.bet_value ?? null,
              d.model_risk ?? null,
              d.oracle_report ?? null,
              d.hexa_hunch ?? null,
              JSON.stringify(d.alert_flags ?? []),
              JSON.stringify(d.probability_model ?? {}),
              JSON.stringify(d.best_pick ?? {}),
              'deep',
              lang,
              oddsAtPick,
              impliedProbAtPick,
              JSON.stringify(value.odds ?? {}),
            ]
          );

          value.pickId = pickResult.rows[0]?.id;
        } catch (saveErr) {
          console.error(`[Batch] Failed to save pick for ${value.matchup}:`, saveErr.message);
        }
      }

      processedResults.push(value);
    }

    const successCount = processedResults.filter(r => r.data && !r.error).length;
    const failCount = processedResults.filter(r => r.error).length;

    console.log(`[Admin Batch] Completed: ${successCount} success, ${failCount} failed out of ${gameIds.length} games`);

    res.json({
      success: true,
      data: {
        results: processedResults,
        summary: {
          total: gameIds.length,
          analyzed: successCount,
          failed: failCount,
          date: resolvedDate,
        },
      },
    });
  } catch (err) {
    console.error('[Admin Batch] Error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/analyze/chat Ã¢â‚¬â€ Direct chat with Oracle (admin only, no credits)
app.post('/api/analyze/chat', analysisLimiter, verifyToken, isAdmin, async (req, res) => {
  const { gameId, question, conversationHistory = [], lang = 'en', date } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const resolvedDate = date || new Date().toISOString().split('T')[0];
    let games    = await getTodayMatches(resolvedDate);
    let gameData = games.find(g => String(g.gamePk) === String(gameId));

    if (!gameData) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (todayStr !== resolvedDate) {
        const retryGames = await getTodayMatches(todayStr);
        gameData = retryGames.find(g => String(g.gamePk) === String(gameId));
        if (gameData) games = retryGames;
      }
    }

    if (!gameData) return res.status(404).json({ success: false, error: `Partido ${gameId} no encontrado` });

    let matchedOdds = null;
    try {
      const allOdds = await getGameOdds();
      matchedOdds = matchOddsToGame(allOdds, gameData.teams?.home?.name, gameData.teams?.away?.name);
    } catch { /* odds are optional */ }

    const contextString = await buildContext(gameData, matchedOdds);

    const answer = await analyzeChat({
      contextString,
      question: question.trim(),
      conversationHistory,
      lang,
    });

    res.json({
      success: true,
      answer,
      mode: 'chat',
    });
  } catch (err) {
    console.error('[Oracle Chat] Error:', err);
    res.status(500).json({ error: 'Chat failed', details: safeError(err) });
  }
});

// GET /api/auth/is-admin Ã¢â‚¬â€ check if the authenticated user is admin
app.get('/api/auth/is-admin', verifyToken, (req, res) => {
  res.json({ isAdmin: req.user.email === 'cdanielrr@hotmail.com' });
});

// POST /api/picks/live-progress - Temporary stub during football migration
app.post('/api/picks/live-progress', verifyToken, async (_req, res) => {
  res.json({ success: true, data: [] });
});

// GET /api/picks/resolve Ã¢â‚¬â€ manually trigger pick resolution (admin/testing)
app.get('/api/picks/resolve', verifyToken, async (_req, res) => {
  try {
    const summary = await resolvePendingPicks();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/picks/resolve-game - Temporary stub during football migration
app.post('/api/picks/resolve-game', verifyToken, async (_req, res) => {
  res.status(501).json({ success: false, error: 'resolve-game is temporarily unavailable during football migration' });
});

// POST /api/picks - guarda un pick en el historial
app.post('/api/picks', verifyToken, async (req, res) => {
  try {
    const {
      type, matchup, pick, oracle_confidence, bet_value,
      model_risk, oracle_report, hexa_hunch, alert_flags,
      probability_model, best_pick, model, language,
      odds_at_pick, odds_details, kelly_recommendation,
    } = req.body;

    // Calculate implied probability server-side from the American odds provided by the client
    const implied_prob_at_pick = odds_at_pick != null
      ? calculateImpliedProbability(odds_at_pick)
      : null;

    const { rows } = await pool.query(
      `INSERT INTO picks (
         user_id, type, matchup, pick, oracle_confidence, bet_value, model_risk,
         oracle_report, hexa_hunch, alert_flags, probability_model, best_pick,
         model, language, odds_at_pick, implied_prob_at_pick, odds_details, kelly_recommendation
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        req.user.id, type, matchup, pick, oracle_confidence, bet_value, model_risk,
        oracle_report, hexa_hunch,
        JSON.stringify(alert_flags ?? []), JSON.stringify(probability_model ?? {}),
        JSON.stringify(best_pick ?? {}), model, language,
        odds_at_pick ?? null,
        implied_prob_at_pick,
        odds_details != null ? JSON.stringify(odds_details) : null,
        kelly_recommendation ?? null,
      ]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/picks/clv-stats Ã¢â‚¬â€ CLV dashboard stats for authenticated user
app.get('/api/picks/clv-stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Aggregate stats for picks with CLV data
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*)                                              AS "totalPicks",
        COUNT(*) FILTER (WHERE clv IS NOT NULL)              AS "picksWithCLV",
        ROUND(AVG(clv) FILTER (WHERE clv IS NOT NULL), 2)   AS "avgCLV",
        COUNT(*) FILTER (WHERE clv > 0)                     AS "positiveCLV",
        COUNT(*) FILTER (WHERE clv < 0)                     AS "negativeCLV"
      FROM picks
      WHERE user_id = $1
    `, [userId]);

    // Last 20 picks with CLV fields
    const { rows: recentPicks } = await pool.query(`
      SELECT id, matchup, pick, model, result,
             odds_at_pick, implied_prob_at_pick,
             closing_odds, implied_prob_closing, clv,
             created_at
      FROM picks
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [userId]);

    // Group by bet type (parsed from pick string in JS to avoid SQL regex complexity)
    const betTypeMap = { moneyline: { count: 0, totalCLV: 0 }, runline: { count: 0, totalCLV: 0 }, over_under: { count: 0, totalCLV: 0 } };
    const modelMap   = {};

    const { rows: allWithCLV } = await pool.query(`
      SELECT pick, model, clv FROM picks WHERE user_id = $1 AND clv IS NOT NULL
    `, [userId]);

    for (const row of allWithCLV) {
      const p = (row.pick ?? '').toLowerCase();
      let betType = 'moneyline';
      if (/over|under|m[aÃƒÂ¡]s\s+de|menos\s+de|alta|baja/i.test(p)) betType = 'over_under';
      else if (/run\s+line|rl|l[iÃƒÂ­]nea\s+de\s+carrera/i.test(p)) betType = 'runline';

      betTypeMap[betType].count++;
      betTypeMap[betType].totalCLV += parseFloat(row.clv);

      const m = row.model ?? 'unknown';
      if (!modelMap[m]) modelMap[m] = { count: 0, totalCLV: 0 };
      modelMap[m].count++;
      modelMap[m].totalCLV += parseFloat(row.clv);
    }

    const clvByBetType = {};
    for (const [key, val] of Object.entries(betTypeMap)) {
      clvByBetType[key] = {
        count:  val.count,
        avgCLV: val.count > 0 ? Math.round((val.totalCLV / val.count) * 100) / 100 : null,
      };
    }

    const clvByModel = {};
    for (const [key, val] of Object.entries(modelMap)) {
      clvByModel[key] = {
        count:  val.count,
        avgCLV: val.count > 0 ? Math.round((val.totalCLV / val.count) * 100) / 100 : null,
      };
    }

    res.json({
      success: true,
      data: {
        totalPicks:   parseInt(stats.totalPicks),
        picksWithCLV: parseInt(stats.picksWithCLV),
        avgCLV:       stats.avgCLV != null ? parseFloat(stats.avgCLV) : null,
        positiveCLV:  parseInt(stats.positiveCLV),
        negativeCLV:  parseInt(stats.negativeCLV),
        clvByBetType,
        clvByModel,
        recentPicks,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/picks Ã¢â‚¬â€ obtiene el historial del usuario
app.get('/api/picks', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM picks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// PATCH /api/picks/:id Ã¢â‚¬â€ actualiza resultado (win/loss/pending)
app.patch('/api/picks/:id', verifyToken, async (req, res) => {
  try {
    const { result } = req.body;
    const { rows } = await pool.query(
      'UPDATE picks SET result = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [result, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Pick not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// DELETE /api/picks/:id Ã¢â‚¬â€ elimina un pick individual del historial
app.delete('/api/picks/:id', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM picks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Pick not found' });
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// DELETE /api/picks Ã¢â‚¬â€ elimina todo el historial del usuario autenticado
app.delete('/api/picks', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM picks WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/odds/movement Ã¢â‚¬â€ line movement data for a specific game
app.get('/api/odds/movement', verifyToken, async (req, res) => {
  try {
    const { home, away, date } = req.query;
    if (!home || !away || !date) {
      return res.status(400).json({ success: false, error: 'home, away and date query params are required' });
    }
    const movement = await getLineMovement(home, away, date);
    if (!movement) {
      return res.json({ success: true, data: null, message: 'Not enough snapshots for line movement (need at least 2)' });
    }
    res.json({ success: true, data: movement });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Startup: run migrations Ã¢â€ â€™ seed admin Ã¢â€ â€™ start server Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
runMigrations()
  .then(() => {
    console.log('[H.E.X.A.] Database migrations applied successfully');
  })
  .catch(() => {
    console.error('[H.E.X.A.] Database connection failed (Postgres not found). Running in "Data-Only" mode.');
  })
  .then(() => {
    return seedAdminUser()
      .then(() => {
        console.log('[H.E.X.A.] Admin seeder executed successfully');
      })
      .catch(() => {
        console.error('[H.E.X.A.] Admin seeder failed. Continuing in "Data-Only" mode.');
      });
  })
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Hexa-v4 server running on http://0.0.0.0:${PORT}`);

      // Ã¢â€â‚¬Ã¢â€â‚¬ Line movement snapshot: every 6 hours between 9amÃ¢â‚¬â€œ7pm ET Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
      const SIX_HOURS_LM = 6 * 60 * 60 * 1000;
      setInterval(() => {
        const etHour = parseInt(
          new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', hour12: false, timeZone: 'America/New_York',
          }).format(new Date()),
          10
        );
        // Window: 09:00Ã¢â‚¬â€œ18:59 ET (lines open in the morning, games start ~18:00+)
        if (etHour >= 9 && etHour < 19) {
          console.log(`[line-movement] Scheduled snapshot triggered (ET hour: ${etHour})`);
          captureOddsSnapshot().catch(err => {
            console.error('[line-movement] Scheduled snapshot failed:', err.message);
          });
        }
      }, SIX_HOURS_LM).unref();

      // Ã¢â€â‚¬Ã¢â€â‚¬ Pick resolver: every 30 min between 7pmÃ¢â‚¬â€œ6am ET Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
      const THIRTY_MIN = 30 * 60 * 1000;
      setInterval(() => {
        // Get current hour in US Eastern Time (handles EDT/EST automatically)
        const etHour = parseInt(
          new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', hour12: false, timeZone: 'America/New_York',
          }).format(new Date()),
          10
        );
        // Window: 19:00Ã¢â‚¬â€œ05:59 ET (west coast games finish ~7pm ET; extras/rain delays can run past 3am)
        if (etHour >= 19 || etHour < 6) {
          console.log(`[pick-resolver] Scheduled run triggered (ET hour: ${etHour})`);
          resolvePendingPicks().catch(err => {
            console.error('[pick-resolver] Scheduled run failed:', err.message);
          });
        }
      }, THIRTY_MIN).unref();

      // Ã¢â€â‚¬Ã¢â€â‚¬ Closing line capture: every 2 hours between 5pmÃ¢â‚¬â€œ1am ET Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      setInterval(() => {
        const etHour = parseInt(
          new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', hour12: false, timeZone: 'America/New_York',
          }).format(new Date()),
          10
        );
        // Closing line capture: 17:00Ã¢â‚¬â€œ00:59 ET (before and during EURO FOOTBALL game windows)
        if (etHour >= 17 || etHour < 1) {
          console.log(`[closing-line] Scheduled capture triggered (ET hour: ${etHour})`);
          captureClosingLines().catch(err => {
            console.error('[closing-line] Scheduled capture failed:', err.message);
          });
        }
      }, TWO_HOURS).unref();
    });
  })
  .catch(err => {
    console.error('[H.E.X.A.] Startup failed FULL ERROR:', err);
    process.exit(1);
  });






