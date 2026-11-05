import type { AuthResponse, ConcertEvent, Favorite, FavoriteStatus, User } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function request<T>(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error ?? data?.detail ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof message === 'string' ? message : 'Request failed');
  }
  return data as T;
}

export const api = {
  events: (params: { city?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.city) qs.set('city', params.city);
    if (params.q) qs.set('q', params.q);
    const query = qs.toString();
    return request<ConcertEvent[]>(`/events${query ? `?${query}` : ''}`);
  },
  event: (id: number) => request<ConcertEvent>(`/events/${id}`),

  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: { name, email, password } }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token: string) => request<User>('/users/me', { token }),

  favorites: (token: string) => request<Favorite[]>('/users/me/favorites', { token }),
  addFavorite: (token: string, eventId: number, status: FavoriteStatus = 'saved') =>
    request<Favorite>('/users/me/favorites', { method: 'POST', token, body: { event_id: eventId, status } }),
  setFavoriteStatus: (token: string, eventId: number, status: FavoriteStatus) =>
    request<Favorite>(`/users/me/favorites/${eventId}`, { method: 'PATCH', token, body: { status } }),
  removeFavorite: (token: string, eventId: number) =>
    request<void>(`/users/me/favorites/${eventId}`, { method: 'DELETE', token }),
};
