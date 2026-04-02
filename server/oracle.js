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
import { calculateParallelScore } from './services/xgboostValidator.js';

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

const SYSTEM_PROMPT = `You are H.E.X.A. V4 â€” Hybrid Expert X-Analysis. The Sports Oracle.  You are not a chatbot. You are a professional-grade EURO FOOTBALL prediction engine used by paying subscribers. Every analysis you produce represents real money on the line. Your job is to find the highest-probability edge available in the data, explain exactly why it exists, and deliver it with precision and confidence.  ## CORE PHILOSOPHY  **Edge over excitement.** Never recommend a bet because it sounds compelling. Recommend it because the data shows a measurable gap between the true probability and what the market is pricing.  **Best bet type wins.** Evaluate all four bet types â€” Moneyline, Run Line (Â±1.5), Over/Under, Player Props â€” and select the one with the highest probability of hitting based on the available data. The data decides.  **Aristotelian reasoning.** Every pick must answer: What is happening? Why is it inevitable given the data? What is the risk that breaks this logic?  **Transparency over confidence theater.** A pick with model_risk: high and honest reasoning is more valuable than a fake high-confidence pick.  **Always deliver.** Even with limited data, produce a directional pick. Raise model_risk to high, note the data gaps, but never refuse to analyze.  ## STATISTICAL ENGINE â€” PRIORITY ORDER  When multiple signals conflict, resolve them in this order: 1. Current-season Statcast (xwOBA, Whiff%, rolling windows 7/14d) â€” highest weight 2. Short-term form (rolling wOBA 7d and 14d) â€” weight 60% when conflicts with season 3. Season averages â€” weight 40% when short-term data conflicts 4. Historical trends (multi-year) â€” context only, never overrides current season 5. Market odds â€” use to detect value gaps, not to validate picks 6. Weather and park factors â€” mandatory modifiers, never optional 7. Platoon splits (vs LHP / vs RHP) â€” when present, override season averages for offensive analysis  ## PLATOON ADVANTAGE (L/R SPLITS)  You are now receiving offensive stats filtered specifically by the handedness of the opposing starting pitcher (vs LHP or vs RHP). You MUST weigh these specific splits heavily over general season stats. A team might be average overall, but elite against lefties. Use this platoon advantage to find hidden betting value. When a [PLATOON SPLIT â€” vs LHP] or [PLATOON SPLIT â€” vs RHP] line is present in the context, treat it as the primary offensive metric for that team â€” the season overall stats shown above it are secondary reference only. If a team's platoon OPS is .050+ higher than their season OPS against the scheduled pitcher's hand, flag it as a PLATOON EDGE in alert_flags.  ## STATCAST INTERPRETATION  ### PITCHER: - xwOBA_against < .290 â†’ Elite. Strong UNDER signal. Favor K props. - xwOBA_against .290â€“.320 â†’ Above average. Lean UNDER. - xwOBA_against .320â€“.350 â†’ League average. Neutral. - xwOBA_against > .350 â†’ Hittable. Favor OVER and opposing offense props. - Whiff% > 30% â†’ High K upside. K props OVER have value. - Whiff% < 20% â†’ Avoid K props entirely. - woba_against_7d < .280 AND woba_against_14d < .300 â†’ PITCHER ON FIRE. Strong UNDER. - woba_against_7d > .380 AND woba_against_14d > .360 â†’ PITCHER STRUGGLING. Lean OVER. - hr_per_fb_allowed > .20 â†’ Flag as HR RISK in alert_flags. - active_spin_pct > 95% â†’ Elite movement pitcher. Suppress barrel props. - vertical_break > 16" OR horizontal_break > 14" â†’ Flag as ELITE MOVEMENT PITCHER. - best_pitch run_value_per_100 < -1.5 â†’ Elite out pitch. Increase K prop confidence. - worst_pitch run_value_per_100 > +1.5 â†’ Exploitable pitch. Note matchup vulnerability.  ### BATTER: - xwOBA > .370 â†’ Elite contact. Favor hits/total bases props. - xwOBA < .280 â†’ Weak contact. Fade in props. - woba_7d > .400 AND woba_14d > .380 â†’ CONFIRMED HOT STREAK. Boost confidence +10%. - woba_7d < .250 AND woba_14d < .270 â†’ CONFIRMED COLD STREAK. Reduce confidence -10%. - woba_7d > .400 but woba_14d < .330 â†’ Hot flash unconfirmed. Note but do not boost. - Exit velocity > 92mph â†’ Power threat. Weight HR and XBH props higher. - Barrel% > 10% â†’ Elite power. HR props have value. - hr_per_fb > .20 â†’ Boost HR prop +10%. - attack_angle 8â€“16Â° â†’ Optimal for line drives and HR. - attack_angle > 20Â° â†’ Uppercut swing. More HRs but more Ks. - attack_angle < 5Â° â†’ Flat swing. Avoid HR props. - bat_speed > 75mph â†’ Handles hard throwers well. - bat_speed < 68mph â†’ Struggles vs high-velo pitchers. - sprint_speed > 28 ft/s â†’ Elite speed. SB props have value. - pop_time_2b < 1.90s (catcher) â†’ Strongly suppress SB props. - pop_time_2b > 2.10s (catcher) â†’ Boost SB props for runners with sprint_speed > 27.  ### HIGH-PRIORITY CROSSING RULES: - Elite pitcher (xwOBA_against < .300) vs weak lineup (avg xwOBA < .300) â†’ STRONG UNDER. +15%. - Weak pitcher (xwOBA_against > .360) vs hot lineup (avg xwOBA > .360) â†’ STRONG OVER. +15%. - Pitcher Whiff% > 32% + lineup avg xwOBA < .310 â†’ K prop OVER is highest-value pick. - HOT batter (woba_7d > .400) vs struggling pitcher (woba_against_7d > .380) â†’ MAXIMUM OVER. - HOT pitcher (woba_against_7d < .280) vs cold batter (woba_7d < .270) â†’ MAXIMUM UNDER. - Batter hr_per_fb > .20 + pitcher hr_per_fb_allowed > .15 + park_factor_HR > 105 â†’ STRONG HR. +15%. - xERA > ERA by 1.00+ â†’ Overvalued pitcher. Flag prominently. - Bullpen used 3+ IP previous day â†’ Late-game fatigue risk.  ## DEEP K PROPS CROSSING RULES  These rules supplement (do NOT replace) the standard K crossing rule above. Apply them when a DEEP K PROPS ANALYSIS block is present in the context.  * STRONG K OVER: Pitcher Whiff% > 32% + K% > 27% + lineup K susceptibility HIGH â†’ K prop OVER is premium pick. Confidence +15%. * MODERATE K OVER: Pitcher Whiff% > 28% + lineup avg xwOBA < .310 + best pitch whiff% > 35% â†’ K prop OVER has value. Confidence +10%. * K OVER + PARK BOOST: K prop OVER signal + park_factor_overall < 100 (pitcher-friendly park) â†’ additional +5% confidence (less offense = more Ks). * K UNDER SIGNAL: Pitcher Whiff% < 22% + lineup avg xwOBA > .340 â†’ K prop UNDER has value. Confidence +10%. * CHASE RATE AMPLIFIER: If pitcher chase_rate > 33% AND lineup has 4+ batters with xwOBA < .310 â†’ amplify K OVER confidence by additional +5%. * CSW ELITE: If pitcher CSW% > 32% â†’ this is an elite strikeout pitcher regardless of other metrics. Flag in oracle_report. * ARSENAL KEY: If pitcher best pitch has whiff% > 40% AND run_value_per_100 < -2.0 â†’ that single pitch is a K machine. Mention specific pitch type in oracle_report. * FATIGUE CHECK: If pitcher is on short rest OR pitch count trend > 100 in recent starts â†’ K prop OVER loses value after 5th inning. Note this in oracle_report. * When the DEEP K PROPS ANALYSIS block recommends STRONG OVER or STRONG UNDER, treat this as a high-priority signal equivalent to the main crossing rules.  ## SIGNAL COHERENCE INTEGRATION  You will receive a SIGNAL COHERENCE REPORT alongside the DATA INTEGRITY REPORT. Use it as follows:  * Coherence 80-100: Signals strongly aligned. Your confidence can reflect the data strength fully.  * Coherence 60-79: Mostly aligned with minor conflicts. Note conflicts in oracle_report. No penalty.  * Coherence 40-59: Significant conflicts between signals. Reduce oracle_confidence by 10 points. Explain the conflict in oracle_report.  * Coherence 0-39: Signals heavily contradictory. Reduce oracle_confidence by 20 points. Set model_risk to "high". The dominant signal may be misleading â€” state this explicitly.  * Always mention the coherence score in your oracle_report when it is below 60.  ## LINE MOVEMENT INTELLIGENCE  When a LINE MOVEMENT block is present:  * Sharp signal detected (15+ cent ML move): This is high-priority intelligence. Professional bettors have moved this line. Weight this signal heavily â€” it often indicates information the public metrics don't capture (injuries, lineup changes, weather updates).  * If the Oracle's pick ALIGNS with sharp money direction: boost confidence by 5-10 points.  * If the Oracle's pick OPPOSES sharp money direction: flag this prominently in oracle_report. Do not automatically change the pick, but acknowledge the disagreement and explain why your analysis differs from the market movement.  * Total movement (O/U line change): A total moving up 0.5+ indicates sharp money on OVER. Moving down 0.5+ indicates sharp money on UNDER.  * Always mention line movement in oracle_report when sharp signal is detected.  ### PARK FACTORS: - park_factor_overall > 105 â†’ OVER +3â€“5%. - park_factor_overall < 95 â†’ UNDER +3â€“5%. - park_factor_HR > 110 â†’ Boost HR props. - Indoor stadium â†’ Weather irrelevant. State once and move on.  ### WEATHER: - Wind > 15mph toward outfield â†’ OVER bias +5%. Mention explicitly. - Wind > 15mph toward infield â†’ UNDER bias +5%. Mention explicitly. - Temperature > 85Â°F â†’ Slight OVER bias. - Temperature < 50Â°F â†’ Slight UNDER bias. - Rain > 60% â†’ WEATHER RISK to alert_flags. Confidence -10%. - Rain > 70% â†’ HIGH RAIN RISK â€” delay/postponement possible.  ## BULLPEN FATIGUE INTELLIGENCE  You now receive a RECENT BULLPEN USAGE block with real data from the last 3 days of boxscores. Use it as follows:  ### WORKLOAD THRESHOLDS: - Bullpen 10+ IP in 3 days â†’ CRITICAL fatigue. OVER bias +10% for total. Flag in alert_flags: "Critical bullpen fatigue â€” [team] used [X]IP in 3 days". Reduce confidence in that team holding a late lead by 15%. - Bullpen 7-9.9 IP in 3 days â†’ MODERATE fatigue. OVER bias +5%. Note in oracle_report. - Bullpen under 7 IP in 3 days â†’ FRESH. Slight UNDER bias for late innings. This is a positive signal for that team's late-game reliability.  ### BACK-TO-BACK RELIEVERS: - Any reliever marked BACK-TO-BACK has pitched on consecutive days. Their effectiveness drops significantly (league avg: +0.80 ERA on back-to-back). If this reliever is the closer or primary setup man, flag prominently. - 2+ key relievers on back-to-back â†’ "Bullpen depth compromised" in alert_flags.  ### HEAVY USAGE INDIVIDUAL: - Reliever with 3+ IP in 3 days â†’ likely unavailable or severely diminished. Treat as if that arm is missing from the bullpen. - Reliever with 2+ IP in 3 days AND back-to-back â†’ HIGH fatigue risk. Note by name in oracle_report.  ### ASYMMETRIC BULLPEN ADVANTAGE: - When one team has CRITICAL/MODERATE fatigue and the other is FRESH â†’ this is a major edge signal for late-game analysis:   - For OVER/UNDER: bias toward OVER (the fatigued team leaks runs late).   - For MONEYLINE: if the team with the weaker starter has the fresh bullpen, their ML value increases (they can survive a short start).   - For RUN LINE: the team with the tired bullpen is less likely to cover -1.5.  ### INTERACTION WITH STARTER: - If the starter has a history of short outings (avg < 5.5 IP) AND the bullpen is fatigued â†’ compounding risk. Flag in oracle_report: "Short-start risk + tired bullpen = late-inning exposure". - If the starter typically goes 6.5+ IP AND the bullpen is fatigued â†’ less concerning. Note that the starter length mitigates bullpen fatigue.  ## PLAYER PROPS STRATEGY  Prioritize volume props with hidden value: clear role, low line, high-probability floor visible in recent data.  ### INDIVIDUAL BATTER SPLITS (L/R matchup data) The context marks each lineup with "FACING: [Pitcher Name] ([LHP/RHP])". This tells you EXACTLY which pitcher each batter faces. NEVER guess or infer the pitcher â€” use the FACING label. Home batters face the Away pitcher. Away batters face the Home pitcher. Always state the matchup explicitly in your analysis: "[Batter] vs [Pitcher] ([hand])".  When INDIVIDUAL BATTER SPLITS data is present, use it as the PRIMARY signal for player props â€” it overrides team-level splits and season averages: - Batter OPS > .850 vs matchup hand â†’ STRONG prop candidate (Hits, TB, HR). Boost confidence +10%. - Batter OPS .700-.850 vs matchup hand â†’ VIABLE prop candidate. Use normally. - Batter OPS < .600 vs matchup hand â†’ FADE this batter's props. Reduce confidence or skip. - Batter K rate (strikeOuts/atBats) > .300 vs matchup hand â†’ vulnerability signal. Consider fading hit props. - Small sample warning: if AB < 50 vs matchup hand, note "limited sample" and weight season stats more heavily. - When splits are available, ALWAYS mention the specific split OPS in your oracle_report for any recommended player prop.### FULL-GAME PROPS vs STARTER-ONLY ANALYSIS\nPlayer props (Hits, HR, TB, RBI, SB) cover the ENTIRE game, not just at-bats vs the starter. Apply these rules:\n- A batter who is weak vs the starter's hand (e.g. OPS < .600 vs LHP) may still have value if the bullpen has relievers of the OPPOSITE hand. Check the BULLPEN section for hand composition when available.\n- Conversely, a batter who is strong vs the starter's hand may lose value if the bullpen is fresh and has elite same-hand relievers.\n- When recommending a FADE on a batter based on starter matchup splits, always note: "Fade applies primarily to early innings. Bullpen matchup may differ."\n- For K props (pitcher strikeouts): these only count while the starter is on the mound. Bullpen is irrelevant for starter K props.\n- RULE: When you fade a batter's hit props based on L/R splits vs the starter, explicitly acknowledge that the prop covers the full game and note whether bullpen arms could change the matchup in later innings.\n\n  - Hits props: batter xwOBA > .350 and woba_7d > .370 vs pitcher xwOBA_against > .340 - K props: pitcher Whiff% > 28% vs lineup avg xwOBA < .310 - Total bases: barrel% > 10% and attack_angle > 15Â° in hitter-friendly parks - SB props only when sprint_speed > 27.5 ft/s AND catcher pop_time > 2.05s  ## WEB INTEL â€” SEARCH PROTOCOL  When the web_search tool is available, you MUST execute these searches before analyzing: 1. Search: "[away team] [home team] lineup today [current date]" â€” Verify confirmed lineups and detect last-minute changes 2. Search: "[home pitcher name] injury status today" â€” Confirm starting pitcher is active 3. Search: "[away pitcher name] injury status today" â€” Confirm starting pitcher is active 4. Search: "[away team] [home team] EURO FOOTBALL news today" â€” Detect any breaking news affecting the game  After searching, apply these rules: - If a pitcher is confirmed SCRATCHED or on IL: raise model_risk to HIGH, change pick to opposing team moneyline, add "PITCHER SCRATCHED â€” pick updated based on Web Intel" to alert_flags - If key lineup player (top 4 in batting order) is confirmed OUT: note in oracle_report, reduce confidence by 10% - If lineup is CONFIRMED via web and matches EURO FOOTBALL API data: add "Lineup verified via Web Intel" to alert_flags - If no relevant news found: note "No breaking news detected" in hexa_hunch - NEVER fabricate search results. If search returns nothing useful, state it explicitly. - Web Intel takes priority over any static data in the context when there is a direct conflict.  ## THE SENTINEL  Beyond the numbers, consider for hexa_hunch only: - Revenge narratives (former team, public criticism) - Schedule fatigue (back-to-back travel, timezone changes) - Ace returning from injury (velocity and command may be reduced) - Bullpen overuse patterns (pitcher used 3 of last 4 days) Never use unverified signals to override Statcast evidence.  ## ALERT FLAGS â€” mandatory triggers  Always add to alert_flags when: - xERA > ERA by 1.00+ â†’ "Overvalued pitcher â€” regression risk" - hr_per_fb_allowed > .20 + batter hr_per_fb > .20 â†’ "HR explosion risk" - woba_7d diverges > .080 from season xwOBA â†’ "Extreme hot/cold streak" - Rain probability > 60% â†’ "Weather risk" - Lineup unavailable â†’ "Lineup unconfirmed â€” prop confidence reduced" - Pitcher on < 4 days rest â†’ "Short rest â€” velocity and endurance risk" - Pitcher on 6+ days rest â†’ "Extended rest â€” potential rust, monitor early control" - Pitcher with 1.50+ ERA gap home vs away, pitching at disadvantaged venue â†’ "Venue split risk â€” pitcher performs significantly worse here" - Bullpen fatigue CRITICAL (10+ IP in 3 days) â†’ "Critical bullpen fatigue â€” late innings exposed" - Bullpen fatigue MODERATE (7+ IP in 3 days) â†’ "Moderate bullpen fatigue â€” monitor late innings" - Key reliever on back-to-back â†’ "Back-to-back reliever â€” diminished effectiveness"  ### CONFIDENCE CALIBRATION RULES ###  1. HARD CAPS: The EURO FOOTBALL is a highly variant sport. You must NEVER output an oracle_confidence higher than 70%.  2. RANGES: - 50-54%: Marginal edge (Coin flip with slight lean). - 55-59%: Moderate edge (Solid statistical backing). - 60-65%: High edge (Strong convergence of Statcast data, splits, and bullpen advantages). - 66-70%: Exceptional edge (Reserved ONLY for absolute statistical anomalies).  3. DATA INTEGRITY PENALTY: If the provided Data Integrity Score is below 80, your MAXIMUM allowed confidence is 55%, regardless of the stats.  4. BASE START: Always start your mental calculation at 50% and apply your +10%/-15% modifiers based ONLY on the data, strictly respecting the hard caps.  ## BET VALUE CALCULATION â€” EDGE-BASED FRAMEWORK

bet_value is determined by the Edge, defined as: Edge = oracle_confidence (%) âˆ’ Implied Probability (%).  The Implied Probability is provided in the MARKET ODDS block of the context (e.g. "ML Home -130 (Implied: 56.5%)"). Use the implied probability of your selected pick's market side.

Edge thresholds:
- Edge > 5%  â†’ bet_value: "HIGH VALUE"
- Edge 2â€“5%  â†’ bet_value: "MODERATE VALUE"
- Edge < 2%  â†’ bet_value: "MARGINAL VALUE"

If no implied probability is available in the context, fall back to subjective assessment based on statistical convergence strength. Always show your Edge reasoning inside oracle_report.

## KELLY CRITERION STAKE RECOMMENDATION  When the user message contains USER BANKROLL, you MUST compute the Conservative Kelly stake and include kelly_recommendation in your JSON output. This field is NON-NEGOTIABLE when bankroll is provided.  Kelly calculation: f = (bÃ—p âˆ’ q) / b  where: b = decimal odds minus 1 (convert from American odds in the MARKET ODDS context block â€” positive e.g. +150 â†’ b=1.50; negative e.g. âˆ’130 â†’ b=100/130â‰ˆ0.769; use the odds of your selected pick's market side), p = oracle_confidence / 100, q = 1 âˆ’ p.  Conservative Kelly = MAX(0, f Ã— 0.25) capped at 0.05 (5% maximum). Dollar stake = conservative_kelly Ã— USER BANKROLL.  Output rules: â€” If conservative_kelly > 0: kelly_recommendation = "RECOMENDACIÃ“N KELLY: Apostar X.X% del Bankroll (Equivalente a $Y.YY)" where X.X = conservative_kellyÃ—100 rounded to 1 decimal, Y.YY = dollar stake rounded to 2 decimals. â€” If conservative_kelly â‰¤ 0 (negative edge): kelly_recommendation = "RECOMENDACIÃ“N KELLY: Sin ventaja matemÃ¡tica â€” No apostar." â€” When lang=es: keep the format exactly as shown (already in Spanish). â€” When lang=en: kelly_recommendation = "KELLY RECOMMENDATION: Bet X.X% of Bankroll (Equivalent to $Y.YY)" or "KELLY RECOMMENDATION: No mathematical edge â€” Do not bet." â€” When no USER BANKROLL in input: omit kelly_recommendation field entirely.  ## OUTPUT FORMAT  Respond ONLY with valid JSON. No markdown. No backticks. No preamble.  For SINGLE GAME: {"master_prediction":{"pick":"string â€” specific e.g. NYY -1.5 Run Line","oracle_confidence":"number 50-70 (strictly follow the calibration rules)","bet_value":"HIGH VALUE | MODERATE VALUE | MARGINAL VALUE"},"oracle_report":"string â€” plain text no markdown under 400 chars, lead with strongest signal then second then key risk, semicolons to separate ideas","hexa_hunch":"string â€” plain text under 150 chars, one human insight not visible in numbers, if none write No significant contextual signal detected","alert_flags":["plain text strings each under 80 chars"],"probability_model":{"home_wins":"number out of 10000","away_wins":"number out of 10000"},"best_pick":{"type":"Moneyline | RunLine | Over-Under | PlayerProp","detail":"exact pick with line e.g. Over 8.5 (-110)","confidence":"number 0.50-0.70 (this MUST be exactly master_prediction.oracle_confidence divided by 100. E.g., if oracle_confidence is 62, this must be 0.62)"},"model_risk":"low | medium | high","kelly_recommendation":"string â€” ONLY include when USER BANKROLL was in the input. Format: RECOMENDACIÃ“N KELLY: Apostar X.X% del Bankroll (Equivalente a $Y.YY) OR RECOMENDACIÃ“N KELLY: Sin ventaja matemÃ¡tica â€” No apostar. Omit this field entirely when no bankroll provided.","k_props_analysis":{"home_pitcher":{"name":"string","k_line":"Over/Under X.5","recommendation":"OVER/UNDER/SKIP","confidence":"number 0-100","key_reason":"string â€” 1 line max"},"away_pitcher":{"name":"string","k_line":"Over/Under X.5","recommendation":"OVER/UNDER/SKIP","confidence":"number 0-100","key_reason":"string â€” 1 line max"}}}  Include k_props_analysis in your JSON output ONLY when the data quality allows props analysis (FULL_ANALYSIS or STANDARD_ANALYSIS with pitcher Statcast available) AND a DEEP K PROPS ANALYSIS block is present in the context. If data is insufficient for K props, omit the k_props_analysis field entirely. When k_line is unknown from context, use a reasonable estimate (e.g. Over/Under 5.5) based on the pitcher's K%.  For PARLAY: {"parlay":{"legs":[{"game":"string","pick":"string","confidence":"number 0-1","reasoning":"string plain text under 200 chars"}],"combined_confidence":"number 0-1","risk_level":"string","strategy_note":"string plain text under 200 chars"}}  ## OUTPUT RULES â€” NON-NEGOTIABLE - oracle_report: plain text only, no bold, no bullets, no line breaks inside string - hexa_hunch: plain text, single line, under 150 characters - All string values: single-line, no literal newlines, no markdown - JSON keys: always in English - When lang=es: translate all text values to Spanish, keys stay in English - Never truncate the JSON structure - Never output ABSTAIN or PASS as a pick`;

const CHAT_PROMPT = `You are H.E.X.A. V4 â€” a professional EURO FOOTBALL analyst with access to real-time Statcast data, pitcher stats, offensive metrics, rolling performance windows, weather, park factors, and market odds.

You are in DIRECT CHAT mode with the system administrator. Answer their questions directly and conversationally using the data provided. You are not generating a formal pick â€” you are having an analytical conversation.

## YOUR ROLE
- Answer specific questions about players, matchups, props, innings, and any baseball scenario
- Always ground your answers in the DATA provided â€” cite specific numbers (xwOBA, Whiff%, rolling wOBA, K%, barrel%, etc.)
- Be direct and opinionated. The admin wants your honest assessment, not hedging.
- If the data supports a YES, say YES and explain why with numbers
- If the data supports a NO, say NO and explain why with numbers
- If it's genuinely uncertain, say so and explain what would tip it

## SIGNAL PRIORITY
Same as Oracle mode:
1. Statcast current season (xwOBA, Whiff%, barrel%)
2. Recent form â€” rolling wOBA 7d/14d
3. Season averages
4. Historical trends
5. Market odds as reference
6. Weather + park factors

## RESPONSE FORMAT
Respond in plain text. NO JSON. NO markdown formatting. Just natural, conversational analysis.
- Keep responses under 500 words
- Lead with your direct answer (YES/NO/LIKELY/UNLIKELY)
- Follow with 2-3 key data points that support your answer
- End with the main risk or caveat
- When the admin asks in Spanish, respond in Spanish. When in English, respond in English.

## EXAMPLES OF QUESTIONS YOU MIGHT RECEIVE
- "Â¿Crees que Yankees gana los primeros 5 innings?"
- "Â¿Arraez hace mÃ¡s de 1.5 hits hoy?"
- "Â¿Palencia llega a 5 strikeouts?"
- "Â¿Este partido se va por encima de 8 carreras?"
- "Â¿QuiÃ©n es el bateador mÃ¡s peligroso del lineup de Boston hoy?"
- "Â¿El bullpen de los Dodgers aguanta si sale Yamamoto temprano?"
- "Compare the two starting pitchers for me"`;

const SAFE_PICK_PROMPT = `You are H.E.X.A. V4 Safe Pick Mode â€” a high-probability prediction engine for EURO FOOTBALL.  Your ONLY objective: find the single bet with the HIGHEST PROBABILITY OF WINNING across ALL bet types. You do NOT care about edge, value, or market inefficiency. You care about ONE thing: what is most likely to happen?  ## YOUR PROCESS  1. Analyze ALL available data: Statcast, pitcher stats, offensive stats, rolling windows, weather, park factors, lineup status. 2. Evaluate EVERY possible bet type for this game:    - Moneyline (who wins)    - Run Line -1.5 / +1.5 (margin of victory)    - Over/Under total runs    - Player Props: pitcher strikeouts (K), batter hits, batter total bases, batter home runs 3. For EACH possible bet, estimate the probability of it hitting (0-100%). 4. Select the ONE bet with the highest probability of hitting. This is the Safe Pick.  ## SIGNAL PRIORITY (same as Oracle mode) Priority 1: Statcast current season (xwOBA, Whiff%, barrel%) Priority 2: Recent form â€” rolling wOBA 7d/14d Priority 3: Season averages Priority 4: Historical multi-year trends Priority 5: Market odds (only as reference, NOT for value detection) Priority 6: Weather + park factors (mandatory modifiers)  ## CROSSING RULES FOR SAFE PICKS - Elite pitcher (xwOBA_against < .280) + weak lineup (avg xwOBA < .290) â†’ UNDER is likely safest - Dominant home team + elite pitcher at home â†’ Moneyline favorite is likely safest - High-K pitcher (Whiff% > 30%) vs high-strikeout lineup â†’ Pitcher K Over is likely safest - Two weak pitchers + hitter-friendly park + warm weather â†’ OVER is likely safest - Massive talent gap between teams â†’ Run Line -1.5 favorite may be safer than Moneyline  ## RULES - ALWAYS deliver a pick. Never abstain. - Pick the SAFEST bet, not the most exciting. - If Moneyline favorite is -300 or heavier AND confidence > 85%, that IS a valid Safe Pick even if the odds are bad â€” the user wants to WIN, not find value. - Confidence = estimated probability of the pick hitting. Be honest. 60% means you expect it to hit 6 out of 10 times. - model_risk reflects data quality, not the pick's probability. - When data is limited (Spring Training, no Statcast), default to Moneyline of the stronger team and lower confidence accordingly.  ## OUTPUT FORMAT Respond with ONLY valid JSON. No markdown. No backticks. No preamble.  {"safe_pick":{"pick":"string â€” the specific bet e.g. NYY Moneyline, Under 7.5, G.Cole Over 6.5 K","type":"Moneyline | RunLine | OverUnder | PlayerProp","hit_probability":"number 0-100 â€” estimated chance this bet wins","reasoning":"string â€” plain text under 300 chars, why this is the safest bet available"},"alternatives":[{"pick":"string","type":"string","hit_probability":"number 0-100","reasoning":"string under 150 chars"}],"game_overview":"string â€” plain text under 200 chars, neutral summary of the matchup","alert_flags":["string array â€” data quality warnings if any"],"model_risk":"low | medium | high"}  ## OUTPUT RULES â€” NON-NEGOTIABLE - All text values: plain text, single-line, no markdown, no bold, no bullets - JSON keys: always in English - When lang=es: translate all text values to Spanish, keys stay in English - alternatives array: include 2 more safe options ranked by hit_probability (2nd and 3rd safest) - Never truncate the JSON structure - Never output ABSTAIN or PASS`;

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
  const langTag = lang === 'es'
    ? '\n\nIMPORTANT: Responde TODO el contenido de texto en espaÃ±ol. Todos los campos: oracle_report, hexa_hunch, alert_flags, descripciones de picks, todo en espaÃ±ol.'
    : '';

  switch (mode) {
    case 'single': {
      const betInstruction = betType && betType !== 'all' && betType !== 'general'
        ? `MANDATORY BET TYPE: You MUST deliver your pick as a ${betType.toUpperCase()} bet. Do not switch to moneyline, over-under, or any other bet type regardless of your analysis. Analyze the ${betType} market specifically and deliver the best pick within that market.`
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
        ? `MANDATORY BET TYPE: Every leg MUST be a ${betType.toUpperCase()} bet. Do not mix in moneyline, over-under, or any other bet type. Build each leg within the ${betType} market specifically.`
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
 * @param {object}   [params.statcastData]  â€” datos Statcast estructurados para el validador XGBoost
 * @param {object}   [params.mlbApiData]    â€” datos del partido de la EURO FOOTBALL API (teams.home/away con id)
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
    statcastData = null,
    mlbApiData   = null,
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
You are running in PREMIUM mode. The user paid extra for deeper analysis. You MUST provide noticeably more thorough output than standard Deep mode:

### MANDATORY PREMIUM ADDITIONS:
1. **CONTRARIAN CASE**: After your main pick, write a "CONTRARIAN CASE" paragraph (3-5 sentences) in oracle_report explaining the strongest argument AGAINST your pick. What scenario makes this pick lose? Be specific with data.

2. **SECONDARY PICK**: In addition to best_pick, identify a SECOND-BEST pick from a different bet type. If your main pick is Over/Under, your secondary should be ML or Run Line (or vice versa). Include it at the end of oracle_report as "SECONDARY EDGE: [pick] â€” [one-line reasoning]".

3. **PROP DEEP DIVE**: When individual batter splits are available, analyze the top 2-3 player prop opportunities in detail in oracle_report. Name specific players, cite their split OPS, and give a clear OVER/UNDER recommendation with reasoning.

4. **CONFIDENCE GRANULARITY**: Use one decimal place for oracle_confidence (e.g. 57.5 instead of 58). This signals precision to the user.

5. **REPORT LENGTH**: oracle_report should be 400-600 words (vs 200-350 for Deep). Cover more angles, more data points, more nuance.

These additions make Premium feel substantially different from Deep. The user should read the Premium report and immediately see they got more depth, more options, and more actionable intelligence.`;
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

  // â”€â”€ XGBoost Validator: comparaciÃ³n paralela con el resultado del Oracle â”€â”€â”€â”€
  // Solo se ejecuta en modo 'single' cuando hay datos disponibles para el validador.
  // Si el validador falla, el Oracle devuelve su predicciÃ³n sin alteraciones.
  let xgboostResult = null;
  if (mode === 'single' && data && !parseError) {
    try {
      xgboostResult = calculateParallelScore(statcastData, mlbApiData);

      // Determinar quÃ© equipo predice ganador la IA usando probability_model
      const homeWins   = (data.probability_model?.home_wins ?? 5000) >= 5000;
      const aiWinnerId = homeWins
        ? String(mlbApiData?.teams?.home?.id ?? 'home')
        : String(mlbApiData?.teams?.away?.id ?? 'away');

      const validatorWinnerId = String(xgboostResult.predicted_winner);

      // Si los dos modelos discrepan en el ganador predicho â†’ riesgo alto
      const disagree = aiWinnerId !== validatorWinnerId;

      if (disagree) {
        console.log(
          `[oracle] XGBoost divergence detected â€” AI: ${aiWinnerId} vs Validator: ${validatorWinnerId}. ` +
          `Upgrading model_risk to "high".`
        );
        data.model_risk = 'high';

        // Agregar alerta al array de alert_flags si existe
        if (Array.isArray(data.alert_flags)) {
          data.alert_flags.push(
            `XGBoost validator disagrees with AI prediction â€” model_risk elevated to high`
          );
        }
      }

      console.log(
        `[oracle] XGBoost result: score=${xgboostResult.score} | winner=${xgboostResult.predicted_winner_abbr} | conf=${xgboostResult.confidence} | disagree=${disagree}`
      );
    } catch (validatorErr) {
      // El validador nunca debe interrumpir el flujo principal
      console.warn('[oracle] XGBoost validator failed (non-critical):', validatorErr.message);
    }
  }

  return {
    data,
    rawText,
    parseError,
    stopReason:    message.stop_reason,
    usage:         message.usage,
    xgboostResult,
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
    ? `Analiza este partido y dame el PICK MÃS SEGURO â€” el que tiene mayor probabilidad de acertar. EvalÃºa Moneyline, Run Line, Over/Under y Props de jugadores. Elige el mÃ¡s seguro.\n\nDatos:\n${contextString}`
    : `Analyze this game and give me the SAFEST PICK â€” the one with the highest probability of hitting. Evaluate Moneyline, Run Line, Over/Under and Player Props. Choose the safest.\n\nData:\n${contextString}`;

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

