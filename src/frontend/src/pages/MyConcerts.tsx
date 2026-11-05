import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatDate } from '../format';
import type { Favorite } from '../types';

export function MyConcerts() {
  const { user, token, loading } = useAuth();
  const [items, setItems] = useState<Favorite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .favorites(token)
      .then(setItems)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  if (loading) return <p className="muted">Loading…</p>;
  if (!user || !token) return <Navigate to="/login?next=%2Fme" replace />;

  const toggleAgenda = async (f: Favorite) => {
    try {
      const updated = await api.setFavoriteStatus(token, f.event_id, f.status === 'planned' ? 'saved' : 'planned');
      setItems((list) => list?.map((x) => (x.event_id === updated.event_id ? updated : x)) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (f: Favorite) => {
    try {
      await api.removeFavorite(token, f.event_id);
      setItems((list) => list?.filter((x) => x.event_id !== f.event_id) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const agenda = items?.filter((f) => f.status === 'planned') ?? [];
  const saved = items?.filter((f) => f.status === 'saved') ?? [];

  const row = (f: Favorite) => (
    <li key={f.event_id} className="row">
      {f.event.image_url ? <img src={f.event.image_url} alt="" /> : <div className="row-img">♪</div>}
      <div className="row-body">
        <Link to={`/events/${f.event_id}`}>
          <strong>{f.event.name}</strong>
        </Link>
        <span className="muted small">
          {formatDate(f.event.date)} · {f.event.venue}, {f.event.city}
        </span>
      </div>
      <div className="row-actions">
        <button className={f.status === 'planned' ? 'secondary' : ''} onClick={() => toggleAgenda(f)}>
          {f.status === 'planned' ? 'Remove from agenda' : '+ Add to agenda'}
        </button>
        <button className="ghost" onClick={() => remove(f)} aria-label={`Remove ${f.event.name}`}>
          ✕
        </button>
      </div>
    </li>
  );

  return (
    <>
      <h1>My concerts</h1>
      {error && <p className="error">{error}</p>}
      {!items && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && (
        <p className="muted">
          You haven't saved any concerts yet. <Link to="/">Find one</Link>
        </p>
      )}

      {agenda.length > 0 && (
        <section>
          <h2>📅 My agenda</h2>
          <ul className="list">{agenda.map(row)}</ul>
        </section>
      )}
      {saved.length > 0 && (
        <section>
          <h2>Saved</h2>
          <ul className="list">{saved.map(row)}</ul>
        </section>
      )}
    </>
  );
}
