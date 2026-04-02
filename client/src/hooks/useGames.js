import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function useGames() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setMatchesLoading(true);
    setError(null);

    fetch(`${API_URL}/api/matches?date=${date}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (json.success) setMatches(json.data);
        else setError(json.error);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setMatchesLoading(false);
      });

    return () => { cancelled = true; };
  }, [date]);

  return {
    matches,
    games: matches, // backward compatibility
    date,
    setDate,
    matchesLoading,
    gamesLoading: matchesLoading, // backward compatibility
    error,
  };
}
