import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { EventCard } from '../components/EventCard';
import type { ConcertEvent } from '../types';

const CITIES = ['Madrid', 'Barcelona', 'Bilbao', 'Valencia', 'Sevilla'];

export function Home() {
  const [params, setParams] = useSearchParams();
  const city = params.get('city') ?? '';
  const [input, setInput] = useState(city);
  const [events, setEvents] = useState<ConcertEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    api
      .events({ city: city || undefined })
      .then((data) => !cancelled && setEvents(data))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [city]);

  const search = (value: string) => {
    const v = value.trim();
    setInput(v);
    setParams(v ? { city: v } : {});
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    search(input);
  };

  const fromCache = events?.some((e) => e.source === 'cache');

  return (
    <>
      <section className="hero">
        <h1>Find your next concert</h1>
        <form onSubmit={onSubmit} className="search">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by city…"
            aria-label="City"
          />
          <button type="submit">Search</button>
        </form>
        <div className="chips">
          {CITIES.map((c) => (
            <button key={c} className={c === city ? 'chip active' : 'chip'} onClick={() => search(c)}>
              {c}
            </button>
          ))}
          {city && (
            <button className="chip" onClick={() => search('')}>
              ✕ Clear
            </button>
          )}
        </div>
      </section>

      <h2>{city ? `Concerts in ${city}` : 'Upcoming concerts'}</h2>
      {fromCache && <p className="notice">Showing cached results — live data is temporarily unavailable.</p>}
      {error && <p className="error">{error}</p>}
      {!events && !error && <p className="muted">Loading…</p>}
      {events?.length === 0 && <p className="muted">No concerts found{city && ` in ${city}`}.</p>}
      <div className="grid">
        {events?.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    </>
  );
}
