"""Zyntra Event Service: catálogo de conciertos.

Modos:
- Demo: sin TICKETMASTER_API_KEY, sirve conciertos de demostración desde la BD.
- Ticketmaster: consulta la Discovery API, guarda los resultados en la BD
  y, si la API falla (clave mala, caída, límite), responde con lo guardado
  marcando "source": "cache".
"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, Float, Integer, String, create_engine, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

log = logging.getLogger("uvicorn.error")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://zyntra:zyntra@localhost:5433/events")
# SQLAlchemy usa psycopg2 por defecto con "postgresql://"; forzamos psycopg 3.
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

TICKETMASTER_API_KEY = os.getenv("TICKETMASTER_API_KEY", "").strip()
TICKETMASTER_COUNTRY = os.getenv("TICKETMASTER_COUNTRY", "ES")
TICKETMASTER_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
MODE = "Ticketmaster" if TICKETMASTER_API_KEY else "Demo"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(300))
    artist: Mapped[str] = mapped_column(String(200))
    venue: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100), index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    price: Mapped[float | None] = mapped_column(Float)
    image_url: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(30), default="demo")


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    artist: str
    venue: str
    city: str
    date: datetime
    price: float | None
    image_url: str | None
    url: str | None
    source: str


# ---------------------------------------------------------------- base de datos

def _demo_events() -> list[Event]:
    base = datetime.now().astimezone().replace(hour=21, minute=0, second=0, microsecond=0)
    rows = [
        ("Rosalía – Motomami World Tour", "Rosalía", "WiZink Center", "Madrid", 12, 65.0),
        ("Vetusta Morla en directo", "Vetusta Morla", "Palau Sant Jordi", "Barcelona", 20, 42.0),
        ("Bad Bunny – Most Wanted Tour", "Bad Bunny", "Estadio Metropolitano", "Madrid", 35, 89.0),
        ("Love of Lesbian", "Love of Lesbian", "Bizkaia Arena BEC", "Bilbao", 28, 38.5),
        ("C. Tangana – Sin Cantar Ni Afinar", "C. Tangana", "Roig Arena", "Valencia", 44, 55.0),
        ("Quevedo en concierto", "Quevedo", "Cartuja Center", "Sevilla", 51, 47.0),
        ("Izal – Despedida", "Izal", "Kursaal", "San Sebastián", 60, 35.0),
        ("Aitana – Alpha Tour", "Aitana", "Palacio de los Deportes", "Madrid", 73, 58.0),
    ]
    return [
        Event(name=n, artist=a, venue=v, city=c, date=base + timedelta(days=d), price=p, source="demo")
        for n, a, v, c, d, p in rows
    ]


def init_db() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        # Migraciones sencillas para tablas creadas por versiones anteriores.
        db.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS url VARCHAR(500)"))
        db.execute(text("ALTER TABLE events ALTER COLUMN name TYPE VARCHAR(300)"))
        if db.scalar(select(func.count()).select_from(Event).where(Event.source == "demo")) == 0:
            db.add_all(_demo_events())
        db.commit()


def _filtered(stmt, city: str | None, q: str | None):
    if city:
        stmt = stmt.where(Event.city.ilike(city))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Event.name.ilike(like), Event.artist.ilike(like)))
    return stmt


# ---------------------------------------------------------------- Ticketmaster

def _pick_image(images: list[dict]) -> str | None:
    if not images:
        return None
    wide = [i for i in images if i.get("ratio") == "16_9"] or images
    return max(wide, key=lambda i: i.get("width", 0)).get("url")


def _parse_date(start: dict) -> datetime | None:
    if start.get("dateTime"):
        return datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
    if start.get("localDate"):
        return datetime.fromisoformat(f"{start['localDate']}T{start.get('localTime') or '00:00:00'}").replace(
            tzinfo=timezone.utc
        )
    return None


def _map_tm_event(e: dict) -> dict | None:
    date = _parse_date(e.get("dates", {}).get("start", {}))
    emb = e.get("_embedded", {})
    venue = (emb.get("venues") or [{}])[0]
    if not date or not venue.get("city", {}).get("name"):
        return None
    attraction = (emb.get("attractions") or [{}])[0]
    prices = e.get("priceRanges") or [{}]
    return {
        "external_id": e["id"],
        "name": e["name"][:300],
        "artist": (attraction.get("name") or e["name"])[:200],
        "venue": (venue.get("name") or "Por confirmar")[:200],
        "city": venue["city"]["name"][:100],
        "date": date,
        "price": prices[0].get("min"),
        "image_url": _pick_image(e.get("images", [])),
        "url": e.get("url"),
        "source": "ticketmaster",
    }


def fetch_ticketmaster(city: str | None, q: str | None, size: int) -> list[dict]:
    params = {
        "apikey": TICKETMASTER_API_KEY,
        "classificationName": "music",
        "countryCode": TICKETMASTER_COUNTRY,
        "sort": "date,asc",
        "size": min(size, 200),
    }
    if city:
        params["city"] = city
    if q:
        params["keyword"] = q
    resp = httpx.get(TICKETMASTER_URL, params=params, timeout=8)
    resp.raise_for_status()
    raw = resp.json().get("_embedded", {}).get("events", [])
    return [m for m in map(_map_tm_event, raw) if m]


def save_events(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    stmt = insert(Event).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Event.external_id],
        set_={c: stmt.excluded[c] for c in rows[0] if c != "external_id"},
    )
    db.execute(stmt)
    db.commit()


# ---------------------------------------------------------------- API

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    log.info("Mode: %s", MODE)
    yield


app = FastAPI(title="Zyntra Event Service", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    with SessionLocal() as db:
        yield db


@app.get("/health")
def health():
    return {"status": "ok", "mode": MODE}


@app.get("/events", response_model=list[EventOut])
def list_events(
    city: str | None = None,
    q: str | None = Query(None, description="Busca en nombre o artista"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    if MODE == "Demo":
        stmt = _filtered(select(Event).where(Event.source == "demo"), city, q).order_by(Event.date)
        return db.scalars(stmt.offset(offset).limit(limit)).all()

    try:
        rows = fetch_ticketmaster(city, q, offset + limit)
        save_events(db, rows)
        ids = [r["external_id"] for r in rows][offset : offset + limit]
        events = db.scalars(select(Event).where(Event.external_id.in_(ids)).order_by(Event.date)).all()
        return events
    except (httpx.HTTPError, ValueError) as exc:
        # No logueamos str(exc): incluye la URL y con ella la apikey.
        reason = f"HTTP {exc.response.status_code}" if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__
        log.warning("Ticketmaster no disponible (%s); sirviendo desde caché", reason)

    now = datetime.now(timezone.utc)
    stmt = _filtered(
        select(Event).where(Event.source == "ticketmaster", Event.date >= now), city, q
    ).order_by(Event.date)
    cached = db.scalars(stmt.offset(offset).limit(limit)).all()
    return [EventOut.model_validate(e).model_copy(update={"source": "cache"}) for e in cached]


@app.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    return event
