import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatDate, formatPrice } from '../format';
import type { ConcertEvent } from '../types';

export function EventDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [event, setEvent] = useState<ConcertEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvent(null);
    setError(null);
    api
      .event(id)
      .then((e) => !cancelled && setEvent(e))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!token) return setSaved(false);
    let cancelled = false;
    api
      .favorites(token)
      .then((list) => !cancelled && setSaved(list.some((f) => f.event_id === id)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  const onSave = async () => {
    if (!user || !token) {
      navigate(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
      return;
    }
    if (!event) return;
    setSaving(true);
    setError(null);
    try {
      await api.addFavorite(token, event.id);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !event) return <p className="error">{error}</p>;
  if (!event) return <p className="muted">Loading…</p>;

  const price = formatPrice(event.price);

  return (
    <article className="detail">
      <button className="ghost back" onClick={() => navigate(-1)}>
        ← Back
      </button>
      {event.image_url && <img src={event.image_url} alt="" className="detail-img" />}
      <h1>{event.name}</h1>
      {event.artist !== event.name && <p className="artist">{event.artist}</p>}
      <dl>
        <dt>When</dt>
        <dd>{formatDate(event.date)}</dd>
        <dt>Where</dt>
        <dd>
          {event.venue}, {event.city}
        </dd>
        <dt>Price</dt>
        <dd>{price ? `from ${price}` : 'See ticket site'}</dd>
      </dl>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {saved ? (
          <Link to="/me" className="button secondary">
            ✓ Saved — view My concerts
          </Link>
        ) : (
          <button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : '♡ Save'}
          </button>
        )}
        {event.url && (
          <a href={event.url} target="_blank" rel="noreferrer" className="button secondary">
            Buy tickets ↗
          </a>
        )}
      </div>
    </article>
  );
}
