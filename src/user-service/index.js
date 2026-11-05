// Zyntra User Service: registro, login, perfil (JWT) y conciertos favoritos.
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const PORT = Number(process.env.PORT ?? 4000);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://zyntra:zyntra@localhost:5434/users';
const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL ?? 'http://127.0.0.1:8000';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

// "saved": guardado en favoritos. "planned": añadido a la agenda.
const STATUSES = ['saved', 'planned'];

if (!JWT_SECRET) {
  console.error('Falta la variable de entorno JWT_SECRET');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(100) NOT NULL,
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(100) NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Favoritos de cada usuario. "event" es una copia de los datos del concierto
  // tomada del Event Service, para poder listarlos sin depender de él.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id   INTEGER NOT NULL,
      status     VARCHAR(20) NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'planned')),
      event      JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, event_id)
    )
  `);
  await pool.query('DROP TABLE IF EXISTS saved_events'); // tabla de una versión anterior
}

const publicUser = ({ id, name, email, created_at }) => ({ id, name, email, createdAt: created_at });
const publicFavorite = ({ event_id, status, event, created_at }) => ({ event_id, status, event, created_at });
const signToken = (user) =>
  jwt.sign({ sub: String(user.id), email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const EVENT_FIELDS = ['id', 'name', 'artist', 'venue', 'city', 'date', 'price', 'image_url', 'url'];
const pickEvent = (e) => Object.fromEntries(EVENT_FIELDS.map((k) => [k, e?.[k] ?? null]));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function fetchEvent(eventId) {
  let res;
  try {
    res = await fetch(`${EVENT_SERVICE_URL}/events/${eventId}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new HttpError(502, 'Event Service no disponible');
  }
  if (res.status === 404) throw new HttpError(404, 'Evento no encontrado');
  if (!res.ok) throw new HttpError(502, 'Event Service no disponible');
  return pickEvent(await res.json());
}

const toEventId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'event_id no válido');
  return id;
};

const toStatus = (value) => {
  if (!STATUSES.includes(value)) throw new HttpError(400, `status debe ser uno de: ${STATUSES.join(', ')}`);
  return value;
};

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o caducado' });
  }
}

// Envuelve handlers async para que los errores lleguen al middleware de errores.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------- auth

app.post(
  '/auth/register',
  route(async (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (!name?.trim() || !email?.trim() || !password) {
      throw new HttpError(400, 'name, email y password son obligatorios');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email no válido');
    if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [name.trim(), email.trim().toLowerCase(), hash],
    );
    if (!rows.length) throw new HttpError(409, 'Ese email ya está registrado');

    const user = rows[0];
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

app.post(
  '/auth/login',
  route(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) throw new HttpError(400, 'email y password son obligatorios');

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Credenciales incorrectas');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

// ---------------------------------------------------------------- perfil

app.get(
  '/users/me',
  requireAuth,
  route(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.auth.sub]);
    if (!rows.length) throw new HttpError(404, 'Usuario no encontrado');
    res.json(publicUser(rows[0]));
  }),
);

// ---------------------------------------------------------------- favoritos

app.get(
  '/users/me/favorites',
  requireAuth,
  route(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM favorites WHERE user_id = $1 ORDER BY (event->>'date') ASC`,
      [req.auth.sub],
    );
    res.json(rows.map(publicFavorite));
  }),
);

// Añadir (o actualizar si ya existe) un favorito: { event_id, status? }
app.post(
  '/users/me/favorites',
  requireAuth,
  route(async (req, res) => {
    const eventId = toEventId(req.body?.event_id);
    const status = toStatus(req.body?.status ?? 'saved');
    const event = await fetchEvent(eventId);

    const { rows } = await pool.query(
      `INSERT INTO favorites (user_id, event_id, status, event) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, event_id) DO UPDATE SET status = EXCLUDED.status, event = EXCLUDED.event
       RETURNING *, (xmax = 0) AS created`,
      [req.auth.sub, eventId, status, event],
    );
    res.status(rows[0].created ? 201 : 200).json(publicFavorite(rows[0]));
  }),
);

// Cambiar el estado: { status: "saved" | "planned" }
app.patch(
  '/users/me/favorites/:eventId',
  requireAuth,
  route(async (req, res) => {
    const eventId = toEventId(req.params.eventId);
    const status = toStatus(req.body?.status);
    const { rows } = await pool.query(
      'UPDATE favorites SET status = $3 WHERE user_id = $1 AND event_id = $2 RETURNING *',
      [req.auth.sub, eventId, status],
    );
    if (!rows.length) throw new HttpError(404, 'Ese evento no está en tus favoritos');
    res.json(publicFavorite(rows[0]));
  }),
);

app.delete(
  '/users/me/favorites/:eventId',
  requireAuth,
  route(async (req, res) => {
    const eventId = toEventId(req.params.eventId);
    await pool.query('DELETE FROM favorites WHERE user_id = $1 AND event_id = $2', [req.auth.sub, eventId]);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------- errores

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

await initDb();
app.listen(PORT, () => console.log(`User Service listening on :${PORT}`));
