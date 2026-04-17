import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { C, BARLOW, MONO } from '../theme';
import { useAuth } from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const POLL_INTERVAL = 30_000;

const T = {
  en: {
    title: 'LIVE TRACKER',
    noMatches: 'No live or near-kickoff fixtures right now',
    noMatchesDesc: 'When a selected fixture is close to kickoff or in progress, it will appear here.',
    lastUpdate: 'Last update',
    minute: 'MIN',
    kickoff: 'Kickoff',
    picks: 'Your Picks',
    events: 'Recent Events',
    noEvents: 'No notable events yet',
    live: 'LIVE',
    final: 'FINAL',
    scheduled: 'SOON',
    pending: 'Awaiting kickoff',
  },
  es: {
    title: 'EN VIVO',
    noMatches: 'No hay partidos en vivo o cerca del kickoff ahora mismo',
    noMatchesDesc: 'Cuando un fixture seleccionado este cerca del inicio o en juego, aparecera aqui.',
    lastUpdate: 'Ultima actualizacion',
    minute: 'MIN',
    kickoff: 'Kickoff',
    picks: 'Tus Picks',
    events: 'Eventos Recientes',
    noEvents: 'Sin eventos relevantes todavia',
    live: 'EN VIVO',
    final: 'FINAL',
    scheduled: 'PRONTO',
    pending: 'Esperando inicio',
  },
};

function fmtClock(value) {
  if (!value) return '--';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtUpdated(value) {
  if (!value) return '--';
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getStatusPalette(status, tone = null) {
  if (tone === 'positive') return { fg: C.green, bg: C.greenDim, border: C.greenLine };
  if (tone === 'negative') return { fg: C.red, bg: C.redDim, border: C.redLine };
  if (tone === 'neutral') return { fg: C.cyan, bg: C.cyanDim, border: C.cyanLine };

  if (status === 'live') return { fg: C.amber, bg: C.amberDim, border: C.amberLine };
  if (status === 'final') return { fg: C.red, bg: C.redDim, border: C.redLine };
  return { fg: C.textMuted, bg: C.surfaceAlt, border: C.border };
}

function StatusBadge({ status, minute, lang }) {
  const t = T[lang] || T.en;
  const palette = getStatusPalette(status);

  const label = status === 'live'
    ? `${t.live}${minute != null ? ` ${minute}'` : ''}`
    : status === 'final'
      ? t.final
      : t.scheduled;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: '8px',
        py: '3px',
        bgcolor: palette.bg,
        border: `1px solid ${palette.border}`,
        fontFamily: MONO,
        fontSize: '0.6rem',
        color: palette.fg,
        letterSpacing: '0.08em',
      }}
    >
      {label}
    </Box>
  );
}

function PickProgress({ pick, lang }) {
  const t = T[lang] || T.en;
  const palette = getStatusPalette(pick.status, pick.tone);

  const statusLabel = pick.status === 'pending'
    ? t.pending
    : pick.status === 'live'
      ? pick.detail
      : pick.status.toUpperCase();

  return (
    <Box
      sx={{
        border: `1px solid ${palette.border}`,
        bgcolor: C.surfaceAlt,
        p: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <Typography sx={{ fontFamily: MONO, fontSize: '0.68rem', color: C.textPrimary, flex: 1 }}>
          {pick.label}
        </Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: '0.58rem', color: palette.fg, letterSpacing: '0.08em' }}>
          {statusLabel}
        </Typography>
      </Box>
      <Box sx={{ height: '4px', bgcolor: `${palette.fg}20`, borderRadius: '999px', overflow: 'hidden' }}>
        <Box
          sx={{
            width: `${Math.max(0, Math.min(100, Number(pick.progress) || 0))}%`,
            height: '100%',
            bgcolor: palette.fg,
            transition: 'width 0.3s ease',
          }}
        />
      </Box>
      <Typography sx={{ fontFamily: MONO, fontSize: '0.56rem', color: C.textMuted }}>
        {pick.pick}
      </Typography>
    </Box>
  );
}

function EventFeed({ events, lang }) {
  const t = T[lang] || T.en;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Typography sx={{ fontFamily: BARLOW, fontSize: '0.58rem', color: C.textMuted, letterSpacing: '0.14em' }}>
        {t.events}
      </Typography>
      {events.length === 0 ? (
        <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: C.textDim }}>
          {t.noEvents}
        </Typography>
      ) : (
        events.map((event) => (
          <Box
            key={event.id}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              px: '8px',
              py: '6px',
              borderLeft: `2px solid ${C.cyanLine}`,
              bgcolor: C.surfaceAlt,
            }}
          >
            <Typography sx={{ fontFamily: MONO, fontSize: '0.58rem', color: C.accent, minWidth: '36px' }}>
              {event.minute != null ? `${event.minute}'` : '--'}
            </Typography>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', color: C.textPrimary }}>
                {event.summary || event.detail || event.type || ''}
              </Typography>
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
}

function MatchCard({ match, picks, lang }) {
  const t = T[lang] || T.en;
  const matchPicks = picks.filter((pick) => String(pick.matchId) === String(match.matchId));

  return (
    <Box
      sx={{
        border: `1px solid ${C.border}`,
        bgcolor: C.surface,
        p: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Typography sx={{ fontFamily: BARLOW, fontSize: '0.62rem', color: C.textMuted, letterSpacing: '0.14em' }}>
            {match.competition?.name || 'Competition'}
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.65rem', color: C.textDim }}>
            {t.kickoff}: {fmtClock(match.kickoff)}
          </Typography>
        </Box>
        <StatusBadge status={match.status} minute={match.minute} lang={lang} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {match.away?.logo && (
            <Box component="img" src={match.away.logo} alt={match.away.name} sx={{ width: 34, height: 34, objectFit: 'contain' }} />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontFamily: BARLOW, fontSize: '0.9rem', color: C.textPrimary, lineHeight: 1.2 }}>
              {match.away?.name}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.58rem', color: C.textMuted }}>
              {match.away?.abbreviation}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ textAlign: 'center', minWidth: '70px' }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '1.3rem', color: C.textPrimary, fontWeight: 700 }}>
            {match.away?.score ?? 0} - {match.home?.score ?? 0}
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.52rem', color: C.textMuted }}>
            {match.status === 'live' && match.minute != null ? `${t.minute} ${match.minute}` : match.statusLong}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end', minWidth: 0 }}>
          <Box sx={{ textAlign: 'right', minWidth: 0 }}>
            <Typography sx={{ fontFamily: BARLOW, fontSize: '0.9rem', color: C.textPrimary, lineHeight: 1.2 }}>
              {match.home?.name}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.58rem', color: C.textMuted }}>
              {match.home?.abbreviation}
            </Typography>
          </Box>
          {match.home?.logo && (
            <Box component="img" src={match.home.logo} alt={match.home.name} sx={{ width: 34, height: 34, objectFit: 'contain' }} />
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr 0.85fr' }, gap: '16px' }}>
        <EventFeed events={match.events || []} lang={lang} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Typography sx={{ fontFamily: BARLOW, fontSize: '0.58rem', color: C.textMuted, letterSpacing: '0.14em' }}>
            {t.picks}
          </Typography>
          {matchPicks.length === 0 ? (
            <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', color: C.textDim }}>
              {t.pending}
            </Typography>
          ) : (
            matchPicks.map((pick) => <PickProgress key={pick.pickId} pick={pick} lang={lang} />)
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function LiveTracker({ lang = 'en' }) {
  const { token } = useAuth();
  const t = T[lang] || T.en;

  const [matches, setMatches] = useState([]);
  const [pickProgress, setPickProgress] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const resolvedMatchesRef = useRef(new Set());

  const fetchLiveState = useCallback(async () => {
    setLoading(true);

    try {
      const liveRes = await fetch(`${API_URL}/api/matches/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const liveJson = await liveRes.json();
      const liveMatches = liveJson.success ? (liveJson.data || []) : [];
      setMatches(liveMatches);

      if (token) {
        const progressRes = await fetch(`${API_URL}/api/picks/live-progress`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const progressJson = await progressRes.json();
        setPickProgress(progressJson.success ? (progressJson.data || []) : []);

        const finalMatches = liveMatches.filter((match) => match.status === 'final');
        for (const match of finalMatches) {
          if (resolvedMatchesRef.current.has(match.matchId)) continue;

          resolvedMatchesRef.current.add(match.matchId);
          fetch(`${API_URL}/api/picks/resolve-game`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ matchId: match.matchId }),
          }).catch(() => {});
        }
      } else {
        setPickProgress([]);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('[LiveTracker] fetch failed:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLiveState();
    const timer = setInterval(fetchLiveState, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchLiveState]);

  return (
    <Box sx={{ maxWidth: 1080, mx: 'auto', py: 2, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          borderBottom: `1px solid ${C.border}`,
          pb: '12px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Typography sx={{ fontFamily: BARLOW, fontSize: '0.85rem', color: C.cyan, letterSpacing: '0.18em' }}>
            {t.title}
          </Typography>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: C.red,
              '@keyframes livePulse': {
                '0%, 100%': { opacity: 1, boxShadow: `0 0 0 0 ${C.red}66` },
                '50%': { opacity: 0.35, boxShadow: `0 0 0 6px transparent` },
              },
              animation: 'livePulse 1.6s ease-in-out infinite',
            }}
          />
          <Typography sx={{ fontFamily: MONO, fontSize: '0.58rem', color: C.textMuted }}>
            {matches.length} fixtures
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {loading && (
            <Box sx={{ width: 80 }}>
              <LinearProgress
                sx={{
                  height: 2,
                  bgcolor: C.cyanDim,
                  '& .MuiLinearProgress-bar': { bgcolor: C.cyan },
                }}
              />
            </Box>
          )}
          <Typography sx={{ fontFamily: MONO, fontSize: '0.56rem', color: C.textMuted }}>
            {t.lastUpdate}: {fmtUpdated(lastUpdate)}
          </Typography>
        </Box>
      </Box>

      {matches.length === 0 ? (
        <Box
          sx={{
            border: `1px solid ${C.border}`,
            bgcolor: C.surface,
            py: '56px',
            px: '20px',
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontFamily: BARLOW, fontSize: '0.9rem', color: C.textMuted, letterSpacing: '0.14em', mb: '8px' }}>
            {t.noMatches}
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: C.textDim, maxWidth: 520, mx: 'auto' }}>
            {t.noMatchesDesc}
          </Typography>
        </Box>
      ) : (
        matches.map((match) => (
          <MatchCard key={match.matchId} match={match} picks={pickProgress} lang={lang} />
        ))
      )}
    </Box>
  );
}
