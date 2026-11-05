# Zyntra

Aplicación web para descubrir conciertos en España, guardarlos y organizar tu agenda de eventos. Usa datos reales de la API de **Ticketmaster** y está construida con una arquitectura de **microservicios** desplegada con **Docker Compose**.

## Funcionalidades

- 🔎 Buscar conciertos por ciudad (datos reales de Ticketmaster, con imagen y enlace de entradas)
- 👤 Registro e inicio de sesión con JWT
- ♡ Guardar conciertos en favoritos
- 📅 Añadirlos a tu agenda personal (*My concerts*)
- 🛟 Caché: si Ticketmaster no responde, se sirven los últimos datos guardados

## Arquitectura

```
                 ┌──────────────────────────┐
  Navegador ───► │ frontend (nginx) :8080   │  React + TypeScript + Vite
                 └────────────┬─────────────┘
                              │ /api/*
                 ┌────────────▼─────────────┐
                 │ gateway :3000            │  Node.js + Express
                 └──────┬────────────┬──────┘
           /api/events  │            │  /api/auth, /api/users
        ┌───────────────▼───┐    ┌───▼───────────────┐
        │ event_service     │◄───│ user_service      │
        │ :8000  FastAPI    │    │ :4000  Express    │
        └───┬───────────┬───┘    └─────────┬─────────┘
            │           │                  │
   Ticketmaster API  events_db          users_db
                     (PostgreSQL)       (PostgreSQL)
```

| Servicio | Tecnología | Responsabilidad |
|----------|-----------|-----------------|
| `frontend` | React 18, TypeScript, Vite, nginx | Interfaz web; nginx sirve la app y reenvía `/api` al gateway |
| `gateway` | Node.js, Express, http-proxy-middleware | Punto de entrada único a la API |
| `event_service` | Python, FastAPI, SQLAlchemy | Catálogo de conciertos, integración con Ticketmaster y caché |
| `user_service` | Node.js, Express, bcrypt, JWT | Usuarios, autenticación y favoritos |
| `events_db` / `users_db` | PostgreSQL 16 | Una base de datos por servicio |

## Puesta en marcha

### Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) en marcha
- Una clave de la API de Ticketmaster: crea una app en [developer.ticketmaster.com](https://developer.ticketmaster.com/) y copia la *Consumer Key* (opcional: sin clave la app funciona en modo demo)

### 1. Configurar las variables de entorno

Crea el archivo `src/.env` (no se sube a git):

```env
TICKETMASTER_API_KEY=tu_consumer_key
JWT_SECRET=una_cadena_larga_y_aleatoria
```

Para generar un `JWT_SECRET` seguro:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 2. Arrancar

```bash
cd src
docker compose up --build
```

Abre **http://localhost:8080**.

| Comando | Para qué |
|---------|----------|
| `docker compose up --build -d` | Arrancar en segundo plano |
| `docker compose ps` | Ver el estado de los contenedores |
| `docker compose logs -f event_service` | Ver los logs de un servicio |
| `docker compose down` | Parar todo (los datos se conservan) |
| `docker compose down -v` | Parar y **borrar** los datos |

## Desarrollo sin Docker

Levanta solo las bases de datos (`docker compose up -d events_db users_db`) y cada servicio en su terminal:

```bash
# Event Service (http://localhost:8000/docs)
cd src/event-service
python -m venv .venv
.venv\Scripts\activate            # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# User Service
cd src/user-service && npm install && npm start

# Gateway
cd src/gateway && npm install && npm start

# Frontend (http://localhost:5173)
cd src/frontend && npm install && npm run dev
```

Variables de entorno de cada servicio:

| Servicio | Variable | Por defecto |
|----------|----------|-------------|
| event-service | `DATABASE_URL` | `postgresql://zyntra:zyntra@localhost:5433/events` |
| event-service | `TICKETMASTER_API_KEY` | *(vacía → modo demo)* |
| event-service | `TICKETMASTER_COUNTRY` | `ES` |
| user-service | `DATABASE_URL` | `postgresql://zyntra:zyntra@localhost:5434/users` |
| user-service | `JWT_SECRET` | *(obligatoria)* |
| user-service | `EVENT_SERVICE_URL` | `http://127.0.0.1:8000` |
| gateway | `PORT` | `3000` |
| gateway | `EVENT_SERVICE_URL` / `USER_SERVICE_URL` | `http://127.0.0.1:8000` / `http://127.0.0.1:4000` |
| frontend | `GATEWAY_URL` | `http://localhost:3000` |

## API

Todas las rutas van a través del gateway con el prefijo `/api`.

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/events?city=&q=&limit=&offset=` | — | Lista conciertos |
| `GET` | `/api/events/:id` | — | Detalle de un concierto |
| `POST` | `/api/auth/register` | — | Registro `{name, email, password}` → `{token, user}` |
| `POST` | `/api/auth/login` | — | Login `{email, password}` → `{token, user}` |
| `GET` | `/api/users/me` | ✔ | Perfil del usuario |
| `GET` | `/api/users/me/favorites` | ✔ | Favoritos del usuario |
| `POST` | `/api/users/me/favorites` | ✔ | Añadir `{event_id, status?}` (`saved` \| `planned`) |
| `PATCH` | `/api/users/me/favorites/:eventId` | ✔ | Cambiar `{status}` |
| `DELETE` | `/api/users/me/favorites/:eventId` | ✔ | Quitar de favoritos |

Las rutas con ✔ requieren la cabecera `Authorization: Bearer <token>`.

## Pruebas

Ver [TESTS.md](TESTS.md): plan de pruebas, comandos para repetirlas y resultados.

## Estructura

```
zyntra/
├── README.md
├── TESTS.md
└── src/
    ├── docker-compose.yml
    ├── .env                 # no versionado
    ├── event-service/       # Python / FastAPI
    ├── user-service/        # Node / Express
    ├── gateway/             # Node / Express
    └── frontend/            # React / TypeScript / Vite + nginx
```
