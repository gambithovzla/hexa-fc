import { useState, useEffect } from 'react';
import { Box, Checkbox, Skeleton, Typography } from '@mui/material';
import { SoccerBall } from 'lucide-react';
import { C, BARLOW, MONO, SANS } from '../theme';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const L = {
  en: {
    title: 'Select Match',
    noMatches: 'No matches scheduled for this date.',
    noMatchesHint: 'Pick another date to search.',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    analyze: 'Analyze Match',
    analyzing: 'Analyzing...',
    selectHint: 'Select a match to continue',
    live: 'LIVE',
    final: 'FINAL',
    scheduled: 'Scheduled',
    legs: 'legs',
    parlayHint: 'Pick 2-6 matches for your parlay',
    vs: 'vs',
    error: 'Failed to load matches',
  },
  es: {
    title: 'Seleccionar Partido',
    noMatches: 'No hay partidos para esta fecha.',
    noMatchesHint: 'Elige otra fecha para buscar.',
    selectAll: 'Seleccionar Todo',
    deselectAll: 'Deseleccionar Todo',
    analyze: 'Analizar Partido',
    analyzing: 'Analizando...',
    selectHint: 'Selecciona un partido para continuar',
    live: 'EN VIVO',
    final: 'FINAL',
    scheduled: 'Programado',
    legs: 'patas',
    parlayHint: 'Elige 2-6 partidos para tu parlay',
    vs: 'vs',
    error: 'Error al cargar los partidos',
  },
};

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

function getMatchId(match) {
  return match?.fixture?.id ?? match?.gamePk ?? match?.id ?? null;
}

function getAwayName(match) {
  return match?.teams?.away?.name ?? 'Away';
}

function getHomeName(match) {
  return match?.teams?.home?.name ?? 'Home';
}

function getAwayLogo(match) {
  return match?.teams?.away?.logo ?? null;
}

function getHomeLogo(match) {
  return match?.teams?.home?.logo ?? null;
}

function getScore(match) {
  const away = match?.goals?.away;
  const home = match?.goals?.home;
  if (away == null || home == null) return null;
  return { away, home };
}

function getTime(match) {
  const rawDate = match?.fixture?.date ?? match?.gameDate;
  if (!rawDate) return '-';
  return new Date(rawDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatus(match) {
  const short = String(match?.fixture?.status?.short ?? '').toUpperCase();
  if (!short || short === 'NS' || short === 'TBD' || short === 'PST' || short === 'CANC') {
    return 'scheduled';
  }
  if (short === 'FT' || short === 'AET' || short === 'PEN' || short === 'WO' || short === 'AWD') {
    return 'final';
  }
  return 'live';
}

function isSelectable(match) {
  return getStatus(match) === 'scheduled';
}

function TeamLogo({ logo, name }) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) return null;
  return (
    <Box
      component="img"
      src={logo}
      alt={name}
      onError={() => setFailed(true)}
      sx={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}

function StatusBadge({ status, t }) {
  const map = {
    scheduled: { label: t.scheduled, color: C.green, pulse: false },
    live: { label: t.live, color: C.amber, pulse: true },
    final: { label: t.final, color: C.red, pulse: false },
  };
  const { label, color, pulse } = map[status] ?? map.scheduled;

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        px: '7px',
        py: '2px',
        borderRadius: '2px',
        bgcolor: status === 'scheduled' ? 'transparent' : `${color}18`,
        border: `1px solid ${color}${status === 'scheduled' ? '88' : '44'}`,
        fontFamily: BARLOW,
        fontSize: '0.62rem',
        fontWeight: 700,
        color,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      {pulse && (
        <Box
          sx={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            bgcolor: color,
            flexShrink: 0,
            '@keyframes hexaPulse': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%': { opacity: 0.25, transform: 'scale(0.65)' },
            },
            animation: 'hexaPulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {label}
    </Box>
  );
}

function MatchCard({ match, isSelected, onClick, showCheckbox, checkboxDisabled, t }) {
  const awayName = getAwayName(match);
  const homeName = getHomeName(match);
  const awayLogo = getAwayLogo(match);
  const homeLogo = getHomeLogo(match);
  const time = getTime(match);
  const status = getStatus(match);
  const score = getScore(match);

  const blocked = status !== 'scheduled';
  const leftBorderColor = isSelected ? C.accent : status === 'live' ? C.amber : 'transparent';

  return (
    <Box
      onClick={blocked ? undefined : onClick}
      sx={{
        position: 'relative',
        background: isSelected ? C.accentDim : C.surface,
        border: `1px solid ${isSelected ? C.accentLine : C.border}`,
        borderLeft: `3px solid ${leftBorderColor}`,
        borderRadius: '4px',
        p: '14px',
        cursor: blocked ? 'not-allowed' : 'pointer',
        opacity: status === 'final' ? 0.5 : 1,
        transition: 'border-color 0.15s, opacity 0.15s',
        '&:hover': blocked
          ? {}
          : {
              borderColor: isSelected ? C.accentLine : C.border,
              background: isSelected ? C.accentDim : C.elevated,
            },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: '12px' }}>
        <StatusBadge status={status} t={t} />
        <Box sx={{ flex: 1 }} />
        <Box
          component="span"
          sx={{
            px: '8px',
            py: '2px',
            borderRadius: '2px',
            bgcolor: 'transparent',
            border: `1px solid ${C.border}`,
            fontFamily: MONO,
            fontSize: '0.64rem',
            color: C.textMuted,
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          {time}
        </Box>
        {showCheckbox && (
          <Checkbox
            checked={isSelected}
            disabled={blocked || checkboxDisabled}
            onClick={e => e.stopPropagation()}
            onChange={blocked || checkboxDisabled ? undefined : onClick}
            size="small"
            sx={{
              p: '3px',
              color: C.border,
              '&.Mui-checked': { color: C.accent },
            }}
          />
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          mb: '8px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <TeamLogo logo={awayLogo} name={awayName} />
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '0.9rem',
              fontWeight: 700,
              color: C.textPrimary,
              lineHeight: 1.2,
            }}
          >
            {awayName}
          </Typography>
        </Box>

        {(status === 'live' || status === 'final') && score != null ? (
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '1rem',
              fontWeight: 700,
              color: status === 'live' ? C.amber : C.textPrimary,
              flexShrink: 0,
              letterSpacing: '0.04em',
            }}
          >
            {score.away} - {score.home}
          </Typography>
        ) : (
          <Typography
            sx={{
              fontFamily: SANS,
              fontSize: '0.65rem',
              color: C.textMuted,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {t.vs}
          </Typography>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '0.9rem',
              fontWeight: 700,
              color: C.textPrimary,
              lineHeight: 1.2,
            }}
          >
            {homeName}
          </Typography>
          <TeamLogo logo={homeLogo} name={homeName} />
        </Box>
      </Box>
    </Box>
  );
}

function AnalyzeButton({ canAnalyze, analyzing, onClick, t }) {
  const active = canAnalyze && !analyzing;
  return (
    <Box
      component="button"
      onClick={active ? onClick : undefined}
      sx={{
        width: '100%',
        py: '13px',
        px: 2,
        mt: 3,
        border: `1px solid ${active ? C.accentLine : C.border}`,
        borderRadius: '2px',
        background: active ? C.accent : C.surface,
        color: active ? '#fff' : C.textMuted,
        fontFamily: BARLOW,
        fontSize: '15px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: active ? 'pointer' : 'not-allowed',
        transition: 'all 0.15s',
        '&:hover': active ? { background: '#fb923c' } : {},
      }}
    >
      {analyzing ? t.analyzing : active ? t.analyze : t.selectHint}
    </Box>
  );
}

export default function GameSelector({
  mode = 'single',
  onSelectGame,
  onSelectMultiple,
  onDateChange,
  onSelect,
  onAnalyze,
  analyzing = false,
  language = 'en',
}) {
  const t = L[language] ?? L.en;

  const [date, setDate] = useState(todayStr);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);

  const [singleMatch, setSingleMatch] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    onDateChange?.(date);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchErr(null);
    setSingleMatch(null);
    setSelectedIds(new Set());

    fetch(`${API_URL}/api/matches?date=${date}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const list = json.success ? json.data : [];
        setMatches(list);

        if (mode === 'fullDay') {
          const selectable = list.filter(isSelectable);
          setSelectedIds(new Set(selectable.map(getMatchId)));
          onSelectMultiple?.(selectable);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchErr(t.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, mode, t.error, onSelectMultiple]);

  function handleSingleClick(match) {
    if (!isSelectable(match)) return;
    const matchId = getMatchId(match);
    const next = getMatchId(singleMatch) === matchId ? null : match;
    setSingleMatch(next);
    onSelectGame?.(next);
    onSelect?.(next);
  }

  function handleCheckbox(match) {
    if (!isSelectable(match)) return;
    const matchId = getMatchId(match);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        if (mode === 'parlay' && next.size >= 6) return prev;
        next.add(matchId);
      }
      const selected = matches.filter(m => next.has(getMatchId(m)));
      onSelectMultiple?.(selected);
      return next;
    });
  }

  function handleSelectAll() {
    const targets = mode === 'fullDay' ? matches.filter(isSelectable) : matches;
    setSelectedIds(new Set(targets.map(getMatchId)));
    onSelectMultiple?.(targets);
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
    onSelectMultiple?.([]);
  }

  const STATUS_SORT = { scheduled: 0, live: 1, final: 2 };
  const displayMatches =
    mode === 'parlay'
      ? matches.filter(isSelectable)
      : [...matches].sort((a, b) => STATUS_SORT[getStatus(a)] - STATUS_SORT[getStatus(b)]);

  const selectableMatches = matches.filter(isSelectable);
  const isAllSelected =
    selectableMatches.length > 0 && selectableMatches.every(m => selectedIds.has(getMatchId(m)));

  const canAnalyze =
    (mode === 'single' && singleMatch != null) ||
    (mode === 'parlay' && selectedIds.size >= 2) ||
    (mode === 'fullDay' && selectedIds.size > 0);

  return (
    <Box sx={{ bgcolor: C.bg, p: 2, minHeight: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <SoccerBall size={16} strokeWidth={2.2} color={C.accent} />
          <Typography
            sx={{
              fontFamily: BARLOW,
              fontSize: '1.1rem',
              fontWeight: 800,
              color: C.textPrimary,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {t.title}
          </Typography>
        </Box>

        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            background: C.surfaceAlt,
            border: `1px solid ${C.border}`,
            borderRadius: '2px',
            color: C.textPrimary,
            fontFamily: MONO,
            fontSize: '0.72rem',
            padding: '5px 9px',
            cursor: 'pointer',
            outline: 'none',
            colorScheme: 'dark',
          }}
        />
      </Box>

      {mode === 'fullDay' && !loading && matches.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={selectedIds.size > 0 && !isAllSelected}
            onChange={isAllSelected ? handleDeselectAll : handleSelectAll}
            size="small"
            sx={{
              p: '2px',
              color: C.border,
              '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: C.accent },
            }}
          />
          <Typography
            onClick={isAllSelected ? handleDeselectAll : handleSelectAll}
            sx={{
              fontFamily: SANS,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: C.accent,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {isAllSelected ? t.deselectAll : t.selectAll}
          </Typography>
        </Box>
      )}

      {mode === 'parlay' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
            gap: 1,
          }}
        >
          <Typography sx={{ fontFamily: SANS, fontSize: '0.72rem', color: C.textMuted }}>
            {t.parlayHint}
          </Typography>
          <Box
            sx={{
              bgcolor: selectedIds.size >= 2 ? C.accentDim : C.surface,
              border: `1px solid ${selectedIds.size >= 2 ? C.accentLine : C.border}`,
              borderRadius: '2px',
              px: 1.5,
              py: '3px',
              fontFamily: MONO,
              fontSize: '0.72rem',
              fontWeight: 700,
              color: selectedIds.size >= 2 ? C.accent : C.textMuted,
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {selectedIds.size} / 6 {t.legs}
          </Box>
        </Box>
      )}

      {loading ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: 2,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              height={122}
              sx={{ borderRadius: '2px', bgcolor: C.surface, transform: 'none' }}
            />
          ))}
        </Box>
      ) : fetchErr ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography sx={{ fontFamily: SANS, fontSize: '0.875rem', color: C.red }}>
            {fetchErr}
          </Typography>
        </Box>
      ) : matches.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 7 }}>
          <Box
            className="soccer-spin-emoji"
            sx={{
              mb: 1,
              fontSize: '1.7rem',
              lineHeight: 1,
              display: 'inline-flex',
              '@keyframes soccerSpinSmooth': {
                from: { transform: 'rotate(0deg)' },
                to: { transform: 'rotate(360deg)' },
              },
              animation: 'soccerSpinSmooth 2.8s linear infinite',
            }}
          >
            {'\u26BD'}
          </Box>
          <Typography sx={{ fontFamily: SANS, fontSize: '0.875rem', color: C.textMuted, mb: 1 }}>
            {t.noMatches}
          </Typography>
          <Typography sx={{ fontFamily: SANS, fontSize: '0.75rem', color: C.textMuted }}>
            {t.noMatchesHint}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: 2,
          }}
        >
          {displayMatches.map(match => {
            const matchId = getMatchId(match);
            const isSelected =
              mode === 'single' ? getMatchId(singleMatch) === matchId : selectedIds.has(matchId);
            const checkboxDisabled = mode === 'parlay' && selectedIds.size >= 6 && !isSelected;

            return (
              <MatchCard
                key={matchId}
                match={match}
                isSelected={isSelected}
                showCheckbox={mode !== 'single'}
                checkboxDisabled={checkboxDisabled}
                onClick={mode === 'single' ? () => handleSingleClick(match) : () => handleCheckbox(match)}
                t={t}
              />
            );
          })}
        </Box>
      )}

      {mode === 'single' && onAnalyze && (
        <AnalyzeButton canAnalyze={canAnalyze} analyzing={analyzing} onClick={onAnalyze} t={t} />
      )}
    </Box>
  );
}
