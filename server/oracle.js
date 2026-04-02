/**
 * server/oracle.js
 * Llama a la API de Claude con el system prompt H.E.X.A. V4.
 *
 * Exporta:
 *   analyzeGame(params)                            â€” funciÃ³n principal (todos los modos)
 *   analyzeParlay(contexts, language, opts)        â€” wrapper para index.js
 *   analyzeFullDay(contexts, date, language, opts) â€” wrapper para index.js
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODELS = {
  deep:    { id: 'claude-sonnet-4-6',  maxTokens: 8000  },
  premium: { id: 'claude-opus-4-5',    maxTokens: 10000 },
};

// ---------------------------------------------------------------------------
// System prompt H.E.X.A. V4
// TODO: pega aquÃ­ el system prompt completo de H.E.X.A. V4
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are H.E.X.A. F.C., an expert European football betting analyst. Football only. Use only football signals and football market logic.

Priority order:
1. xG vs xGA
2. Shots and Shots on Target
3. FormLast5
4. Home vs Away performance
5. Goals for/against
6. Market odds only to detect value

Rules:
- Compare the teams directly. Do not describe them separately.
- Find the real edge, not a narrative.
- Pick the single best bet only from 1X2, Asian Handicap, or Over/Under.
- Never invent data. If data is missing, say so and raise model_risk.
- Do not repeat raw numbers without explaining what they mean.

Reasoning:
- xG and xGA are the main truth signal.
- Use shot volume and shots on target to confirm whether the xG edge is real pressure.
- Use FormLast5 as momentum only, not as the main driver.
- Use home/away splits to test whether the edge holds at this venue.
- Use goals for/against to confirm whether process is translating into output.
- Use market prices only after the football read is complete.

oracle_report must be one plain-text line with these labeled sections separated by semicolons:
Match Reading: ...; Tactical Edge: ...; Risk Factors: ...; Best Bet: ...; Confidence Score: ...; Model Risk: ...

Keep the existing JSON contract:
{"master_prediction":{"pick":"string","oracle_confidence":"number 0-100","bet_value":"HIGH VALUE | MODERATE VALUE | MARGINAL VALUE"},"oracle_report":"string","hexa_hunch":"string","alert_flags":["string"],"probability_model":{"home_wins":"number out of 10000","away_wins":"number out of 10000"},"best_pick":{"type":"1X2 | Asian Handicap | Over-Under","detail":"exact pick","confidence":"number 0-1 and exactly oracle_confidence divided by 100"},"model_risk":"low | medium | high","kelly_recommendation":"string only when bankroll exists"}

Kelly:
- If USER BANKROLL exists, compute conservative Kelly from the selected market side and include kelly_recommendation.
- If no bankroll exists, omit kelly_recommendation.

Value:
- Edge > 5% = HIGH VALUE
- Edge 2-5% = MODERATE VALUE
- Edge < 2% = MARGINAL VALUE

Final rules:
- Respond only with valid JSON.
- JSON keys stay in English.
- When lang=es, all text values must be in Spanish.
- Never output ABSTAIN or PASS.
- Never fabricate stats, odds, or injuries.`;

const CHAT_PROMPT = `You are H.E.X.A. F.C. in direct chat mode, an expert European football analyst.

Rules:
- Football only.
- Prioritize xG vs xGA, shots, shots on target, FormLast5, home vs away performance, goals for/against, and market odds as value context.
- Compare teams directly instead of describing them separately.
- Be explicit about the edge and the main risk.
- Never invent missing data.

Response format:
- Plain text only. No JSON. No markdown.
- Keep responses under 500 words.
- Lead with the direct answer.
- Support it with 2-3 concrete data points.
- End with the main caveat.
- Respond in Spanish when asked in Spanish, otherwise in English.`;

const SAFE_PICK_PROMPT = `You are H.E.X.A. F.C. Safe Pick Mode, a high-probability European football analyst.

Your only task is to find the single safest bet among:
- 1X2
- Asian Handicap
- Over/Under

Rules:
- Football only.
- Prioritize xG vs xGA, then shots and shots on target, then FormLast5, then home vs away performance, then goals for/against, then market odds as reference.
- Compare both teams directly.
- Never invent missing data.
- If the data is thin, still deliver the safest pick and raise model_risk.

Output format:
Respond only with valid JSON. No markdown. No backticks. No preamble.
{"safe_pick":{"pick":"string","type":"1X2 | Asian Handicap | OverUnder","hit_probability":"number 0-100","reasoning":"string plain text under 300 chars"},"alternatives":[{"pick":"string","type":"string","hit_probability":"number 0-100","reasoning":"string under 150 chars"}],"game_overview":"string plain text under 200 chars","alert_flags":["string array with data quality warnings if any"],"model_risk":"low | medium | high"}

Output rules:
- All text values must be plain text and single line.
- JSON keys stay in English.
- When lang=es, all text values must be in Spanish.
- alternatives must include the 2nd and 3rd safest options.
- Never output ABSTAIN or PASS.`;

// ---------------------------------------------------------------------------
// ConstrucciÃ³n del mensaje de usuario segÃºn el modo
// ---------------------------------------------------------------------------

/**
 * @param {object}   p
 * @param {string}   p.matchup
 * @param {string}   [p.betType]
 * @param {string}   p.context
 * @param {string}   p.riskProfile
 * @param {string}   p.mode         â€” "single" | "fullDay" | "parlay"
 * @param {string}   p.lang
 * @param {string[]} [p.games]
 * @param {number}   [p.legs]
 * @returns {string}
 */
function buildUserMessage({ matchup, betType, context, riskProfile, mode, lang, games = [], legs, userBankroll }) {
  const normalizedBetType = (() => {
    switch (String(betType ?? '').toLowerCase()) {
      case 'moneyline':
      case 'ml':
        return '1X2';
      case 'runline':
      case 'spread':
      case 'asian_handicap':
      case 'asian handicap':
        return 'Asian Handicap';
      case 'totals':
      case 'total':
      case 'over_under':
      case 'over-under':
        return 'Over-Under';
      default:
        return betType?.toUpperCase?.() ?? betType;
    }
  })();

  const langTag = lang === 'es'
    ? '\n\nIMPORTANT: Responde TODO el contenido de texto en espaÃ±ol. Todos los campos: oracle_report, hexa_hunch, alert_flags, descripciones de picks, todo en espaÃ±ol.'
    : '';

  switch (mode) {
    case 'single': {
      const betInstruction = betType && betType !== 'all' && betType !== 'general'
        ? `MANDATORY BET TYPE: You MUST deliver your pick as a ${normalizedBetType} bet. Do not switch to a different market. Analyze that market specifically and deliver the best pick within it.`
        : `Bet focus: all types â€” select the highest-value bet type based on the data.`;
      const bankrollLine = userBankroll != null
        ? `\nUSER BANKROLL: $${userBankroll.toFixed(2)} â€” You MUST compute the Kelly stake and include kelly_recommendation in your JSON output.`
        : '';
      return (
        `Analyze: ${matchup}\n` +
        `${betInstruction}\n` +
        `Risk: ${riskProfile}${bankrollLine}\n\n` +
        `CONTEXT:\n${context}` +
        langTag
      );
    }

    case 'fullDay':
      return (
        `Analyze full slate:\n` +
        `${games.join('\n')}\n` +
        `Risk: ${riskProfile}\n\n` +
        `CONTEXT PER GAME:\n${context}` +
        langTag
      );

    case 'parlay': {
      const numLegs = legs ?? games.length;
      const parlayBetInstruction = betType && betType !== 'all' && betType !== 'general'
        ? `MANDATORY BET TYPE: Every leg MUST be a ${normalizedBetType} bet. Do not mix in other markets. Build each leg within that market specifically.`
        : `Bet focus: all types â€” select the highest-value bet type per leg based on the data.`;
      return (
        `Build ${numLegs}-leg parlay from:\n` +
        `${games.join('\n')}\n` +
        `Risk: ${riskProfile}\n` +
        `${parlayBetInstruction}\n\n` +
        `CONTEXT:\n${context}` +
        langTag
      );
    }

    default:
      throw new Error(`oracle: modo desconocido "${mode}"`);
  }
}

// ---------------------------------------------------------------------------
// ExtracciÃ³n y parseo de la respuesta
// ---------------------------------------------------------------------------

/**
 * Une todos los bloques de texto de la respuesta en un string.
 */
function extractRawText(response) {
  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

/**
 * Limpieza agresiva antes de intentar parsear.
 * Quita markdown fences, backticks sueltos y extrae el bloque {...}.
 */
function cleanJsonResponse(text) {
  if (!text) return text;

  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^`+|`+$/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

/** Repairs common JSON issues: smart quotes, special chars, markdown inside strings, trailing commas */
function repairJson(text) {
  let s = text;
  // Replace smart/curly quotes with straight quotes
  s = s.replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/[\u2018\u2019]/g, "'");
  // Replace em-dash and en-dash inside strings with hyphen
  s = s.replace(/[\u2014\u2013]/g, '-');
  // Remove literal newlines inside JSON string values
  // Strategy: find all string values and sanitize them
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
    const fixed = inner
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return `"${fixed}"`;
  });
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

/**
 * Intenta parsear el texto como JSON.
 * - Si tiene Ã©xito  â†’ { data: <objeto>, parseError: false }
 * - Si falla        â†’ { data: null, parseError: true }  (JSON malformado)
 * - Si no hay JSON  â†’ { data: null, parseError: false }  (prosa â€” no es un error)
 *
 * @param {string} raw
 * @returns {{ data: object|null, parseError: boolean }}
 */
function parseResponse(raw) {
  if (!raw || raw.trim() === '') {
    return { data: null, parseError: true, errorReason: 'empty_response' };
  }

  console.log('[oracle] RAW (first 300):', JSON.stringify(raw.slice(0, 300)));

  const cleaned = cleanJsonResponse(raw);
  console.log('[oracle] CLEANED (first 300):', JSON.stringify(cleaned.slice(0, 300)));

  function sanitize(obj) {
    if (obj?.probability_model?.note !== undefined) {
      const { note: _note, ...rest } = obj.probability_model; // eslint-disable-line no-unused-vars
      return { ...obj, probability_model: rest };
    }
    return obj;
  }

  // Attempt 1: direct parse
  try {
    const parsed = sanitize(JSON.parse(cleaned));
    console.log('[oracle] parse OK (direct)');
    return { data: parsed, parseError: false };
  } catch (e) {
    console.log('[oracle] direct parse failed:', e.message);
  }

  // Attempt 2: repair then parse
  try {
    const repaired = repairJson(cleaned);
    const parsed = sanitize(JSON.parse(repaired));
    console.log('[oracle] parse OK (repaired)');
    return { data: parsed, parseError: false };
  } catch (e) {
    console.log('[oracle] repair parse failed:', e.message);
  }

  // Attempt 3: extract largest {...} block and repair
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const repaired = repairJson(match[0]);
      const parsed = sanitize(JSON.parse(repaired));
      console.log('[oracle] parse OK (extract+repair)');
      return { data: parsed, parseError: false };
    } catch (err) {
      console.log('[oracle] extract+repair failed:', err.message);
      return { data: null, parseError: true, errorReason: 'invalid_json', parseErrorMessage: err.message };
    }
  }

  return { data: null, parseError: false };
}

// ---------------------------------------------------------------------------
// FunciÃ³n principal exportada
// ---------------------------------------------------------------------------

/**
 * Analiza un partido, parlay o jornada completa vÃ­a la API de Claude.
 *
 * @param {object}   params
 * @param {string}   params.matchup         â€” "NYY @ BOS" (modo single)
 * @param {string}   [params.betType]       â€” "moneyline" | "totals" | "runline" | â€¦
 * @param {string}   params.context         â€” string de buildContext()
 * @param {string}   [params.riskProfile]   â€” "low" | "medium" | "high"  (def. "medium")
 * @param {string}   [params.mode]          â€” "single" | "fullDay" | "parlay" (def. "single")
 * @param {string}   [params.lang]          â€” idioma de la respuesta (def. "en")
 * @param {boolean}  [params.webSearch]     â€” incluir tool web_search (def. false)
 * @param {string[]} [params.games]         â€” lista de matchups para fullDay/parlay
 * @param {number}   [params.legs]          â€” nÃºmero de patas del parlay
 * @param {string}   [params.model]         â€” "fast" (Haiku) | "deep" (Sonnet)  (def. "fast")
 * @param {number}   [params.timeoutMs]     â€” abort oracle call after this many ms; throws Error('TIMEOUT')
 *
 * @returns {Promise<{
 *   data:       object|null,
 *   rawText:    string,
 *   parseError: boolean,
 *   stopReason: string,
 *   usage:      object,
 * }>}
 */
export async function analyzeGame(params) {
  const {
    matchup      = '',
    betType,
    context      = '',
    riskProfile  = 'medium',
    mode         = 'single',
    lang         = 'en',
    webSearch    = false,
    games        = [],
    legs,
    model        = 'deep',
    timeoutMs    = null,
    userBankroll = null,
  } = params;

  const { id: modelId, maxTokens } = MODELS[model] ?? MODELS.deep;

  const userMessage = buildUserMessage({
    matchup, betType, context, riskProfile, mode, lang, games, legs, userBankroll,
  });

  // â”€â”€ Premium tier enhancements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let systemPrompt = SYSTEM_PROMPT;

  if (model === 'premium') {
    systemPrompt += `

## PREMIUM ANALYSIS MODE â€” ENHANCED OUTPUT
You are running in PREMIUM mode. The user paid extra for deeper football analysis.

### MANDATORY PREMIUM ADDITIONS:
1. Add a CONTRARIAN CASE in oracle_report explaining the best argument against your pick.
2. Add a SECONDARY EDGE from a different market family than the main pick. If the main pick is Over/Under, the secondary should be 1X2 or Asian Handicap, and vice versa.
3. Be more explicit about signal conflicts, especially xG vs recent results and home/away split tension.
4. Use one decimal place for oracle_confidence when helpful.
5. Make the reasoning noticeably deeper than standard mode without breaking the one-line JSON-safe format.`;
  }

  if (lang === 'es') {
    systemPrompt += '\n\nIMPORTANT: Respond ALL text content in Spanish (espaÃ±ol). All fields: oracle_report, hexa_hunch, alert_flags, pick descriptions, strategy_note, day_summary â€” everything in Spanish. JSON keys remain in English.';
  }

  const requestBody = {
    model:      modelId,
    max_tokens: maxTokens,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userMessage }],
  };

  if (webSearch) {
    requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  // â”€â”€ DEBUG: log full prompt before API call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('=== H.E.X.A. DEBUG: FULL CONTEXT ===');
  console.log('Game:', matchup || 'Full Day');
  console.log('Mode:', mode);
  console.log('Web Intel:', webSearch);
  console.log('Model:', modelId);
  console.log('--- SYSTEM PROMPT ---');
  console.log(systemPrompt);
  console.log('--- USER PROMPT / CONTEXT ---');
  console.log(userMessage);
  console.log('=== END DEBUG ===');

  // Stream the response; race against optional timeout
  const streamPromise = anthropic.messages.stream(requestBody).finalMessage();
  const message = await (timeoutMs
    ? Promise.race([
        streamPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        ),
      ])
    : streamPromise);

  const rawText              = extractRawText(message);

  // â”€â”€ DEBUG: log response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('=== H.E.X.A. DEBUG: CLAUDE RESPONSE ===');
  console.log((rawText?.substring(0, 500) ?? '') + (rawText?.length > 500 ? '...' : ''));
  console.log('=== END RESPONSE ===');

  const { data, parseError } = parseResponse(rawText);

  return {
    data,
    rawText,
    parseError,
    stopReason:    message.stop_reason,
    usage:         message.usage,
    xgboostResult: null,
  };
}

// ---------------------------------------------------------------------------
// Wrappers de conveniencia â€” mantienen la firma que usa index.js
// ---------------------------------------------------------------------------

/**
 * Analiza varios partidos como parlay.
 *
 * @param {string[]} contexts  â€” un string de contexto por partido
 * @param {string}   [language]
 * @param {object}   [opts]    â€” riskProfile, webSearch, â€¦
 */
export async function analyzeParlay(contexts, language = 'en', opts = {}) {
  return analyzeGame({
    mode:        'parlay',
    matchup:     `${contexts.length}-leg parlay`,
    context:     contexts.join('\n\n---\n\n'),
    lang:        language,
    legs:        opts.legs        ?? contexts.length,
    games:       contexts.map((_, i) => `Game ${i + 1}`),
    betType:     opts.betType,
    riskProfile: opts.riskProfile ?? 'medium',
    webSearch:   opts.webSearch   ?? false,
    model:       opts.model       ?? 'fast',
    timeoutMs:   opts.timeoutMs   ?? null,
  });
}

/**
 * Analiza la jornada completa.
 *
 * @param {string[]} contexts  â€” un string de contexto por partido
 * @param {string}   [date]
 * @param {string}   [language]
 * @param {object}   [opts]
 */
export async function analyzeFullDay(contexts, date = '', language = 'en', opts = {}) {
  return analyzeGame({
    mode:        'fullDay',
    matchup:     `Full slate â€” ${date}`,
    context:     contexts.join('\n\n---\n\n'),
    lang:        language,
    games:       contexts.map((_, i) => `Game ${i + 1}`),
    betType:     opts.betType,
    riskProfile: opts.riskProfile ?? 'medium',
    webSearch:   opts.webSearch   ?? false,
    model:       opts.model       ?? 'fast',
    timeoutMs:   opts.timeoutMs   ?? null,
  });
}

/**
 * Analiza un partido en modo Safe Pick â€” devuelve el pick con mayor probabilidad de acierto.
 *
 * @param {object} params
 * @param {string} params.contextString â€” string de contexto del partido (buildContext)
 * @param {string} [params.lang]        â€” idioma de la respuesta (def. "en")
 *
 * @returns {Promise<{ data: object|null, rawText: string, parseError: boolean }>}
 */
export async function analyzeSafe({ contextString, lang = 'en' }) {
  const modelConfig = MODELS.deep; // Safe Pick always uses Sonnet

  const userMessage = lang === 'es'
    ? `Analiza este partido y dame el PICK MÁS SEGURO. Evalúa 1X2, Asian Handicap y Over/Under. Elige solo el más sólido.\n\nDatos:\n${contextString}`
    : `Analyze this game and give me the SAFEST PICK. Evaluate 1X2, Asian Handicap, and Over/Under. Choose only the safest option.\n\nData:\n${contextString}`;

  const response = await anthropic.messages.create({
    model:      modelConfig.id,
    max_tokens: modelConfig.maxTokens,
    system:     SAFE_PICK_PROMPT,
    messages:   [{ role: 'user', content: userMessage }],
  });

  const raw = response.content?.[0]?.text ?? '';

  console.log('[oracle:safe] RAW (first 300):', JSON.stringify(raw.slice(0, 300)));

  const { data, parseError } = parseResponse(raw);

  return { data, rawText: raw, parseError };
}

/**
 * Responde preguntas directas del admin usando contexto del partido.
 *
 * @param {object}   params
 * @param {string}   params.contextString        â€” string de contexto del partido (buildContext)
 * @param {string}   params.question             â€” pregunta del admin
 * @param {Array}    [params.conversationHistory] â€” turnos anteriores [{question, answer}]
 * @param {string}   [params.lang]               â€” idioma (def. "en")
 *
 * @returns {Promise<string>} â€” respuesta conversacional en texto plano
 */
export async function analyzeChat({ contextString, question, conversationHistory = [], lang = 'en' }) {
  const modelConfig = MODELS.deep; // Chat always uses Sonnet

  // Build messages array with conversation history
  const messages = [];

  // Add previous conversation turns if any
  for (const turn of conversationHistory) {
    messages.push({ role: 'user', content: turn.question });
    messages.push({ role: 'assistant', content: turn.answer });
  }

  // Add current question with context
  const currentMessage = lang === 'es'
    ? `Datos del partido:\n${contextString}\n\nMi pregunta: ${question}`
    : `Game data:\n${contextString}\n\nMy question: ${question}`;

  messages.push({ role: 'user', content: currentMessage });

  const response = await anthropic.messages.create({
    model: modelConfig.id,
    max_tokens: 2000,
    system: CHAT_PROMPT,
    messages,
  });

  return response.content?.[0]?.text ?? 'No response generated.';
}

