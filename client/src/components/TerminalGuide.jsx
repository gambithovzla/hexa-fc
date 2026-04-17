/**
 * TerminalGuide.jsx
 * Interactive user manual â€” Bloomberg Terminal aesthetic.
 *
 * Props:
 *   open    â€” boolean
 *   onClose â€” () => void
 *   lang    â€” 'en' | 'es'
 */

import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { C, BARLOW, MONO, SANS } from '../theme';

const ANIM_CSS = `
@keyframes revealUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
@keyframes glowPulse { 0%,100% { border-left-color: rgba(255,102,0,0.3) } 50% { border-left-color: rgba(255,102,0,0.9) } }
@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
@media (prefers-reduced-motion:reduce) { * { animation:none!important } }
`;

// â”€â”€ Content data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TABS = [
  { id: 'oracle',    en: '1. The Oracle',          es: '1. The Oracle'            },
  { id: 'safepick',  en: '2. Safe Pick Mode',       es: '2. Safe Pick Mode'        },
  { id: 'flags',     en: '3. Alert Flags',           es: '3. Alert Flags'           },
  { id: 'bankroll',  en: '4. Bankroll Management',   es: '4. GestiÃ³n de Bankroll'   },
];

const CONTENT = {
  oracle: {
    en: {
      title: 'THE ORACLE',
      subtitle: 'Proprietary Algorithmic Engine',
      sections: [
        {
          heading: 'What is The Oracle?',
          body: `The Oracle is H.E.X.A.'s core processing system â€” a proprietary football engine that cross-references match context, xG, shot volume, recent form, home/away splits, and market pricing to turn raw match data into quantified edges and actionable probability signals.`,
        },
        {
          heading: 'Standard Mode',
          body: `Standard Mode delivers rapid analysis by processing the most impactful football signals: xG, xGA, shots, shots on target, recent form, goals for/against, and venue context. Results are returned in seconds, giving you a sharp, data-driven read on any matchup.`,
        },
        {
          heading: 'Deep Analytics Mode  Â·  PREMIUM',
          body: `Deep Analytics Mode unlocks the full power of the Advanced Processing System. It runs multi-layer cross-referencing across historical databases, situational splits, venue effects, lineup news, tactical context, and market movement. This mode is reserved for Premium users and provides the highest-confidence output the system can generate.`,
          highlight: true,
        },
        {
          heading: 'Data Sources',
          body: `All analysis is grounded in football match data, team statistics, and real-time odds feeds. No guesswork â€” every signal is traceable to a verifiable statistical source.`,
        },
      ],
    },
    es: {
      title: 'THE ORACLE',
      subtitle: 'Motor AlgorÃ­tmico Propietario',
      sections: [
        {
          heading: 'Â¿QuÃ© es The Oracle?',
          body: `The Oracle es el sistema central de procesamiento de H.E.X.A. â€” un motor propietario de fÃºtbol que cruza contexto del partido, xG, volumen de tiro, forma reciente, splits local/visitante y precios de mercado para convertir datos crudos en ventajas cuantificadas y seÃ±ales de probabilidad accionables.`,
        },
        {
          heading: 'Standard Mode',
          body: `El Modo EstÃ¡ndar entrega anÃ¡lisis rÃ¡pidos procesando las seÃ±ales de fÃºtbol de mayor impacto: xG, xGA, tiros, tiros al arco, forma reciente, goles a favor/en contra y contexto de localÃ­a. Los resultados se generan en segundos y entregan una lectura precisa y basada en datos de cualquier enfrentamiento.`,
        },
        {
          heading: 'Deep Analytics Mode  Â·  PREMIUM',
          body: `El Modo Deep Analytics desbloquea la potencia completa del Sistema de Procesamiento Avanzado. Ejecuta cruces multicapa sobre bases de datos histÃ³ricas, splits situacionales, efectos de localÃ­a, noticias de alineaciÃ³n, contexto tÃ¡ctico y movimiento de mercado. Este modo es exclusivo para usuarios Premium y genera el output de mayor confianza que el sistema puede producir.`,
          highlight: true,
        },
        {
          heading: 'Fuentes de Datos',
          body: `Todo anÃ¡lisis estÃ¡ respaldado por datos de partidos, estadÃ­sticas de equipos y feeds de momios en tiempo real. Sin conjeturas â€” cada seÃ±al es rastreable a una fuente estadÃ­stica verificable.`,
        },
      ],
    },
  },

  safepick: {
    en: {
      title: 'SAFE PICK MODE',
      subtitle: '2-Credit Full-Market Scan',
      sections: [
        {
          heading: 'How it works',
          body: `Safe Pick Mode costs 2 credits and triggers a simultaneous scan across all available betting markets for a selected game. The algorithm does not guess â€” it calculates.`,
        },
        {
          heading: 'Markets Analyzed',
          body: `The system evaluates three football market dimensions in parallel:\n\nâ€¢ 1X2 â€” outright result probability vs. implied odds\nâ€¢ Asian Handicap â€” spread-adjusted edge calculation\nâ€¢ Over/Under Goals â€” total-goals model vs. posted line`,
        },
        {
          heading: 'Expected Value Engine',
          body: `After scanning all four markets, the system applies the Expected Value formula (EV+) to each candidate:\n\nEV = (Win% Ã— Net Profit) âˆ’ (Loss% Ã— Stake)\n\nThe market with the highest positive EV is returned as the Safe Pick. This is not a preference â€” it is the mathematically optimal selection given current conditions.`,
          highlight: true,
        },
        {
          heading: 'When to use Safe Pick',
          body: `Use Safe Pick Mode when you want a single, high-confidence recommendation without manually evaluating multiple markets. It is especially powerful for games with wide prop menus or inflated line movement where identifying true value is non-trivial.`,
        },
      ],
    },
    es: {
      title: 'SAFE PICK MODE',
      subtitle: 'Escaneo Completo de Mercado â€” 2 CrÃ©ditos',
      sections: [
        {
          heading: 'CÃ³mo funciona',
          body: `El Safe Pick Mode cuesta 2 crÃ©ditos y activa un escaneo simultÃ¡neo en todos los mercados de apuestas disponibles para un juego seleccionado. El algoritmo no adivina â€” calcula.`,
        },
        {
          heading: 'Mercados Analizados',
          body: `El sistema evalÃºa tres dimensiones de mercado de fÃºtbol en paralelo:\n\nâ€¢ 1X2 â€” probabilidad de resultado final vs. momios implÃ­citos\nâ€¢ Asian Handicap â€” cÃ¡lculo de ventaja ajustada al spread\nâ€¢ Over/Under Goals â€” modelo de goles totales vs. la lÃ­nea publicada`,
        },
        {
          heading: 'Motor de Valor Esperado',
          body: `Tras escanear los cuatro mercados, el sistema aplica la fÃ³rmula de Valor Esperado (EV+) a cada candidato:\n\nEV = (% Victoria Ã— Ganancia Neta) âˆ’ (% Derrota Ã— Apuesta)\n\nEl mercado con el EV positivo mÃ¡s alto se devuelve como el Safe Pick. No es una preferencia â€” es la selecciÃ³n matemÃ¡ticamente Ã³ptima dadas las condiciones actuales.`,
          highlight: true,
        },
        {
          heading: 'CuÃ¡ndo usar Safe Pick',
          body: `Usa el Safe Pick Mode cuando quieras una recomendaciÃ³n Ãºnica de alta confianza sin evaluar manualmente mÃºltiples mercados. Es especialmente poderoso para juegos con menÃºs de props amplios o movimiento de lÃ­nea inflado donde identificar valor real no es trivial.`,
        },
      ],
    },
  },

  flags: {
    en: {
      title: 'ALERT FLAGS',
      subtitle: 'Signal Classification System',
      sections: [
        {
          heading: 'Overview',
          body: `The Advanced Processing System does not output raw probabilities alone â€” it overlays a three-tier flag system to communicate signal quality, risk level, and confidence grade in a format that is immediately actionable.`,
        },
        {
          heading: 'ðŸ”´  Red Flags â€” Danger / Regression Signal',
          body: `Red Flags indicate one of two conditions:\n\n1. Statistical Regression Risk â€” a team is performing significantly above or below its established baseline, suggesting mean reversion is imminent.\n\n2. Imminent Danger â€” a structural disadvantage exists in the matchup (e.g., severe fatigue, tactical mismatch, or adverse venue context) that materially reduces the probability of the expected outcome.`,
          flagColor: C.red,
        },
        {
          heading: 'ðŸŸ¡  Amber Flags â€” Caution / Volatility',
          body: `Amber Flags signal elevated uncertainty in the model's projection. Common triggers include:\n\nâ€¢ High variance in recent sample window\nâ€¢ Conflicting signals across data sources\nâ€¢ Weather conditions with meaningful run-environment impact\nâ€¢ Lineup volatility (late scratches, unexpected batting order changes)\n\nAmber Flags do not invalidate a pick â€” they indicate that position sizing should be conservative.`,
          flagColor: C.amber,
          highlight: false,
        },
        {
          heading: 'ðŸŸ¢  Green Flags â€” Elite Signal / Clear Edge',
          body: `Green Flags are the system's highest-confidence markers. They fire when multiple independent data streams converge on the same conclusion:\n\nâ€¢ Strong xG alignment with actual performance\nâ€¢ Favorable home/away and tactical context\nâ€¢ Sharp money movement in the same direction\nâ€¢ Historical precedent supporting the projected outcome\n\nGreen Flags represent the clearest edges the system identifies.`,
          flagColor: C.green,
          highlight: true,
        },
      ],
    },
    es: {
      title: 'ALERT FLAGS',
      subtitle: 'Sistema de ClasificaciÃ³n de SeÃ±ales',
      sections: [
        {
          heading: 'VisiÃ³n General',
          body: `El Sistema de Procesamiento Avanzado no genera solo probabilidades brutas â€” superpone un sistema de banderas de tres niveles para comunicar calidad de seÃ±al, nivel de riesgo y grado de confianza en un formato inmediatamente accionable.`,
        },
        {
          heading: 'ðŸ”´  Banderas Rojas â€” Peligro / SeÃ±al de RegresiÃ³n',
          body: `Las Banderas Rojas indican una de dos condiciones:\n\n1. Riesgo de RegresiÃ³n EstadÃ­stica â€” un equipo estÃ¡ rindiendo significativamente por encima o por debajo de su lÃ­nea base establecida, sugiriendo que la regresiÃ³n a la media es inminente.\n\n2. Peligro Inminente â€” existe una desventaja estructural en el enfrentamiento (ej. fatiga severa, desajuste tÃ¡ctico o contexto adverso de localÃ­a) que reduce materialmente la probabilidad del resultado esperado.`,
          flagColor: C.red,
        },
        {
          heading: 'ðŸŸ¡  Banderas Ãmbar â€” PrecauciÃ³n / Volatilidad',
          body: `Las Banderas Ãmbar seÃ±alan incertidumbre elevada en la proyecciÃ³n del modelo. Disparadores comunes incluyen:\n\nâ€¢ Alta varianza en la ventana de muestra reciente\nâ€¢ SeÃ±ales conflictivas entre fuentes de datos\nâ€¢ Condiciones climÃ¡ticas con impacto significativo en el partido\nâ€¢ Volatilidad en la alineaciÃ³n (bajas de Ãºltimo momento, cambios inesperados en el once)\n\nLas Banderas Ãmbar no invalidan un pick â€” indican que el tamaÃ±o de posiciÃ³n debe ser conservador.`,
          flagColor: C.amber,
        },
        {
          heading: 'ðŸŸ¢  Banderas Verdes â€” SeÃ±al Ã‰lite / Ventaja Clara',
          body: `Las Banderas Verdes son los marcadores de mayor confianza del sistema. Se activan cuando mÃºltiples flujos de datos independientes convergen en la misma conclusiÃ³n:\n\nâ€¢ Fuerte alineaciÃ³n de xStats con rendimiento real\nâ€¢ Apilamiento favorable de platoon y factor de estadio\nâ€¢ Movimiento de dinero inteligente en la misma direcciÃ³n\nâ€¢ Precedente histÃ³rico que respalda el resultado proyectado\n\nLas Banderas Verdes representan las ventajas mÃ¡s claras que el sistema identifica.`,
          flagColor: C.green,
          highlight: true,
        },
      ],
    },
  },

  bankroll: {
    en: {
      title: 'BANKROLL MANAGEMENT',
      subtitle: 'Kelly Criterion â€” Mathematical Stake Sizing',
      sections: [
        {
          heading: 'The Problem with Flat Betting',
          body: `Flat betting (wagering the same amount on every pick regardless of edge) is mathematically suboptimal. It ignores the most critical variable in long-term profitability: the size of your advantage on any given bet. H.E.X.A. addresses this directly.`,
        },
        {
          heading: 'The Kelly Criterion',
          body: `The system uses the Kelly Criterion â€” a mathematically derived formula for optimal bankroll allocation:\n\nf* = (bp âˆ’ q) / b\n\nWhere:\nâ€¢ f* = fraction of bankroll to wager\nâ€¢ b  = net odds received (decimal odds âˆ’ 1)\nâ€¢ p  = estimated probability of winning\nâ€¢ q  = probability of losing (1 âˆ’ p)\n\nThe formula maximizes the logarithmic growth rate of your bankroll over time, which is equivalent to maximizing long-run wealth without risking ruin.`,
          highlight: true,
          mono: true,
        },
        {
          heading: 'How H.E.X.A. Applies It',
          body: `After generating its probability estimate for a given pick, the system feeds that estimate â€” alongside the current market odds â€” into the Kelly formula. The output is an exact recommended stake percentage based on the calculated edge.\n\nFor example: if the system assigns 58% win probability to a pick priced at -110 (implied 52.4%), the Kelly output will reflect that 5.6% edge with a specific, proportional stake recommendation.`,
        },
        {
          heading: 'Fractional Kelly',
          body: `H.E.X.A. applies a Fractional Kelly multiplier (typically 0.25Ã—â€“0.5Ã—) to the raw output. This reduces variance and protects against model uncertainty while preserving the edge-proportional sizing logic. It is the industry-standard approach used by professional sports bettors and quantitative traders alike.`,
        },
        {
          heading: 'Discipline is the Edge',
          body: `The Bankroll Management module is only as effective as your commitment to following it. The Kelly Criterion assumes consistent application across a large sample. Deviating from the suggested sizing â€” either by over-betting winners or under-betting high-edge picks â€” erodes the mathematical advantage the system provides.`,
        },
      ],
    },
    es: {
      title: 'GESTIÃ“N DE BANKROLL',
      subtitle: 'Criterio de Kelly â€” Dimensionamiento MatemÃ¡tico de Apuesta',
      sections: [
        {
          heading: 'El Problema con las Apuestas Planas',
          body: `Las apuestas planas (apostar la misma cantidad en cada pick independientemente de la ventaja) son matemÃ¡ticamente subÃ³ptimas. Ignoran la variable mÃ¡s crÃ­tica en la rentabilidad a largo plazo: el tamaÃ±o de tu ventaja en cada apuesta. H.E.X.A. aborda esto directamente.`,
        },
        {
          heading: 'El Criterio de Kelly',
          body: `El sistema utiliza el Criterio de Kelly â€” una fÃ³rmula derivada matemÃ¡ticamente para la asignaciÃ³n Ã³ptima del bankroll:\n\nf* = (bp âˆ’ q) / b\n\nDonde:\nâ€¢ f* = fracciÃ³n del bankroll a apostar\nâ€¢ b  = momios netos recibidos (momios decimales âˆ’ 1)\nâ€¢ p  = probabilidad estimada de victoria\nâ€¢ q  = probabilidad de derrota (1 âˆ’ p)\n\nLa fÃ³rmula maximiza la tasa de crecimiento logarÃ­tmico de tu bankroll en el tiempo, equivalente a maximizar la riqueza a largo plazo sin arriesgarte a la ruina.`,
          highlight: true,
          mono: true,
        },
        {
          heading: 'CÃ³mo lo Aplica H.E.X.A.',
          body: `Tras generar su estimaciÃ³n de probabilidad para un pick determinado, el sistema introduce esa estimaciÃ³n â€” junto con los momios actuales del mercado â€” en la fÃ³rmula de Kelly. El resultado es un porcentaje exacto de apuesta recomendado basado en la ventaja calculada.\n\nPor ejemplo: si el sistema asigna 58% de probabilidad de victoria a un pick con precio de -110 (implÃ­cito 52.4%), el output de Kelly reflejarÃ¡ esa ventaja del 5.6% con una recomendaciÃ³n de apuesta especÃ­fica y proporcional.`,
        },
        {
          heading: 'Kelly Fraccional',
          body: `H.E.X.A. aplica un multiplicador de Kelly Fraccional (tÃ­picamente 0.25Ã—â€“0.5Ã—) al output bruto. Esto reduce la varianza y protege contra la incertidumbre del modelo mientras preserva la lÃ³gica de dimensionamiento proporcional a la ventaja. Es el enfoque estÃ¡ndar de la industria utilizado por apostadores deportivos profesionales y traders cuantitativos por igual.`,
        },
        {
          heading: 'La Disciplina es la Ventaja',
          body: `El mÃ³dulo de GestiÃ³n de Bankroll solo es efectivo en la medida en que te comprometas a seguirlo. El Criterio de Kelly asume aplicaciÃ³n consistente a lo largo de una muestra grande. Desviarse del dimensionamiento sugerido â€” ya sea apostando de mÃ¡s en ganadores o apostando de menos en picks de alta ventaja â€” erosiona la ventaja matemÃ¡tica que el sistema proporciona.`,
        },
      ],
    },
  },
};

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SidebarTab({ tab, active, lang, onClick }) {
  const label = lang === 'es' ? tab.es : tab.en;
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display:       'block',
        width:         '100%',
        textAlign:     'left',
        px:            '20px',
        py:            '14px',
        border:        'none',
        borderLeft:    active ? `2px solid ${C.accent}` : `2px solid transparent`,
        bgcolor:       active ? C.accentDim : 'transparent',
        color:         active ? C.accent : C.textTertiary,
        fontFamily:    MONO,
        fontSize:      '0.68rem',
        fontWeight:    active ? 700 : 400,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor:        'pointer',
        transition:    'all 0.15s',
        whiteSpace:    'nowrap',
        lineHeight:    1.4,
        '&:hover': {
          bgcolor: active ? C.accentDim : 'rgba(255,255,255,0.03)',
          color:   active ? C.accent : C.textSecondary,
        },
      }}
    >
      {label}
    </Box>
  );
}

function Section({ heading, body, highlight, mono, flagColor }) {
  const borderColor = flagColor ?? (highlight ? C.accentLine : C.border);
  const bgColor     = flagColor
    ? `${flagColor}0d`
    : highlight
    ? C.accentDim
    : 'transparent';

  // Format body: replace \n\n with double breaks, \n with single
  const paragraphs = body.split('\n\n');

  return (
    <Box
      sx={{
        mb:           '28px',
        pb:           '28px',
        borderBottom: `1px solid ${C.border}`,
        '&:last-child': { borderBottom: 'none', mb: 0, pb: 0 },
      }}
    >
      {/* Heading */}
      <Typography
        sx={{
          fontFamily:    MONO,
          fontSize:      '0.65rem',
          fontWeight:    700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         flagColor ?? (highlight ? C.accent : C.textTertiary),
          mb:            '12px',
        }}
      >
        {heading}
      </Typography>

      {/* Body */}
      <Box
        sx={{
          p:            highlight || flagColor ? '16px' : 0,
          border:       highlight || flagColor ? `1px solid ${borderColor}` : 'none',
          borderRadius: '3px',
          bgcolor:      bgColor,
        }}
      >
        {paragraphs.map((para, i) => {
          // Render bullet lines
          const lines = para.split('\n');
          return (
            <Box key={i} sx={{ mb: i < paragraphs.length - 1 ? '12px' : 0 }}>
              {lines.map((line, j) => (
                <Typography
                  key={j}
                  sx={{
                    fontFamily:  mono ? MONO : SANS,
                    fontSize:    mono ? '0.72rem' : '0.82rem',
                    lineHeight:  mono ? 1.9 : 1.75,
                    color:       C.textSecondary,
                    letterSpacing: mono ? '0.04em' : '0.01em',
                    mb:          line.startsWith('â€¢') ? '4px' : 0,
                    pl:          line.startsWith('â€¢') ? '4px' : 0,
                  }}
                >
                  {line}
                </Typography>
              ))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function ContentArea({ tabId, lang }) {
  const data = CONTENT[tabId]?.[lang] ?? CONTENT[tabId]?.en;
  if (!data) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* Content header */}
      <Box
        sx={{
          px:           '32px',
          pt:           '28px',
          pb:           '20px',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <Typography
          sx={{
            fontFamily:    MONO,
            fontSize:      '1.1rem',
            fontWeight:    700,
            letterSpacing: '0.15em',
            color:         C.textPrimary,
            mb:            '4px',
          }}
        >
          {data.title}
        </Typography>
        <Typography
          sx={{
            fontFamily:    MONO,
            fontSize:      '0.6rem',
            letterSpacing: '0.1em',
            color:         C.accent,
            textTransform: 'uppercase',
          }}
        >
          {data.subtitle}
        </Typography>
      </Box>

      {/* Body â€” flows naturally, parent handles scroll */}
      <Box sx={{ px: '32px', py: '28px' }}>
        {data.sections.map((section, i) => (
          <Box
            key={i}
            style={section.highlight
              ? { borderLeft: '3px solid', animation: `revealUp 0.4s ease ${i * 0.15}s both, glowPulse 3s ease infinite` }
              : { animation: `revealUp 0.4s ease ${i * 0.15}s both` }
            }
          >
            <Section {...section} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function TerminalGuide({ open, onClose, lang = 'en' }) {
  const [activeTab, setActiveTab] = useState('oracle');
  const [booted, setBooted] = useState(false);
  const [bootLines, setBootLines] = useState([]);

  useEffect(() => {
    if (!open) { setBooted(false); setBootLines([]); return; }
    const lines = ['> INITIALIZING H.E.X.A. GUIDE...', '> LOADING DOCUMENTATION...', '> SYSTEM READY'];
    let i = 0;
    const t = setInterval(() => {
      if (i < lines.length) { setBootLines(prev => [...prev, lines[i]]); i++; }
      else { clearInterval(t); setTimeout(() => setBooted(true), 300); }
    }, 250);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;

  return (
    /* Full-screen takeover â€” covers everything including the Header */
    <Box
      sx={{
        position:   'fixed',
        top:        0,
        left:       0,
        right:      0,
        bottom:     0,
        width:      '100vw',
        height:     '100vh',
        zIndex:     9999,
        bgcolor:    '#000000',
        overflowY:  'auto',
        display:    'flex',
        flexDirection: 'column',
      }}
    >
      <style>{ANIM_CSS}</style>
      {/* â”€â”€ Top bar â”€â”€ */}
      <Box
        sx={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          px:             '20px',
          py:             '10px',
          bgcolor:        C.surface,
          borderBottom:   `1px solid ${C.border}`,
          flexShrink:     0,
          position:       'sticky',
          top:            0,
          zIndex:         1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Typography
            sx={{
              fontFamily:    MONO,
              fontSize:      '0.6rem',
              fontWeight:    700,
              letterSpacing: '0.18em',
              color:         C.accent,
              textTransform: 'uppercase',
            }}
          >
            H.E.X.A. TERMINAL
          </Typography>
          <Box sx={{ width: '1px', height: '12px', bgcolor: C.border }} />
          <Typography
            sx={{
              fontFamily:    MONO,
              fontSize:      '0.55rem',
              letterSpacing: '0.1em',
              color:         C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            {lang === 'es' ? 'GuÃ­a Interactiva' : 'Interactive Guide'}
          </Typography>
        </Box>

        {/* Neon orange close button */}
        <Box
          component="button"
          onClick={onClose}
          sx={{
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            px:             '14px',
            py:             '6px',
            border:         '1px solid #ff6600',
            borderRadius:   '2px',
            bgcolor:        'transparent',
            color:          '#ff6600',
            fontFamily:     MONO,
            fontSize:       '0.65rem',
            fontWeight:     700,
            letterSpacing:  '0.1em',
            cursor:         'pointer',
            transition:     'all 0.15s',
            textTransform:  'uppercase',
            '&:hover': {
              bgcolor: 'rgba(255,102,0,0.12)',
              boxShadow: '0 0 8px rgba(255,102,0,0.5)',
            },
          }}
        >
          [ X ] {lang === 'es' ? 'CERRAR GUÃA' : 'CLOSE GUIDE'}
        </Box>
      </Box>

      {/* â”€â”€ Boot sequence â”€â”€ */}
      {!booted && (
        <Box sx={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', p:4 }}>
          {bootLines.map((line, i) => (
            <Typography key={i} sx={{ fontFamily:MONO, fontSize:'0.75rem', color: i === bootLines.length-1 ? C.accent : C.textMuted, mb:'6px' }}>
              {line}<span style={{ animation:'blink 1s infinite' }}>_</span>
            </Typography>
          ))}
        </Box>
      )}

      {/* â”€â”€ Body: sidebar + content â”€â”€ */}
      {booted && <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <Box
          sx={{
            width:        { xs: '160px', sm: '220px' },
            flexShrink:   0,
            bgcolor:      C.surface,
            borderRight:  `1px solid ${C.border}`,
            overflowY:    'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            pt:           '8px',
            position:     'sticky',
            top:          '41px',
            alignSelf:    'flex-start',
            height:       'calc(100vh - 41px)',
          }}
        >
          {/* Sidebar label */}
          <Typography
            sx={{
              fontFamily:    MONO,
              fontSize:      '0.5rem',
              letterSpacing: '0.14em',
              color:         C.textDim,
              textTransform: 'uppercase',
              px:            '20px',
              pb:            '10px',
              pt:            '4px',
            }}
          >
            {lang === 'es' ? 'MÃ³dulos' : 'Modules'}
          </Typography>

          {TABS.map(tab => (
            <SidebarTab
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              lang={lang}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}

          {/* Sidebar footer */}
          <Box
            sx={{
              px:        '20px',
              py:        '16px',
              borderTop: `1px solid ${C.border}`,
              mt:        '16px',
            }}
          >
            <Typography
              sx={{
                fontFamily:    MONO,
                fontSize:      '0.48rem',
                letterSpacing: '0.08em',
                color:         C.textGhost,
                lineHeight:    1.6,
              }}
            >
              H.E.X.A. V4<br />
              {lang === 'es' ? 'Motor AlgorÃ­tmico' : 'Algorithmic Engine'}<br />
              {lang === 'es' ? 'Propietario' : 'Proprietary System'}
            </Typography>
          </Box>
        </Box>

        {/* Content pane */}
        <Box sx={{ flex: 1, bgcolor: C.bg }}>
          <ContentArea tabId={activeTab} lang={lang} />
        </Box>
      </Box>}
    </Box>
  );
}

