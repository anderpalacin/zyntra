export interface ConcertEvent {
  id: number;
  name: string;
  artist: string;
  venue: string;
  city: string;
  date: string;
  price: number | null;
  image_url: string | null;
  url: string | null;
  source?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type FavoriteStatus = 'saved' | 'planned';

export interface Favorite {
  event_id: number;
  status: FavoriteStatus;
  event: ConcertEvent;
  created_at: string;
}
