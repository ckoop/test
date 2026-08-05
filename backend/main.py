from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Text, Date, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from typing import Optional, List
import os, csv, io, json as json_lib, re, logging, asyncio, imaplib, email as email_lib, email.utils
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib, ssl

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("epoch")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./timetracker.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── Models ─────────────────────────────────────────────────────────────────────

class TimeEntry(Base):
    __tablename__ = "time_entries"
    id               = Column(Integer, primary_key=True, index=True)
    start_time       = Column(DateTime, nullable=False)
    end_time         = Column(DateTime, nullable=True)
    duration_minutes = Column(Float, nullable=True)
    date             = Column(Date, nullable=False)
    project          = Column(String(200), nullable=True, default="Allgemein")
    description      = Column(String(500), nullable=True)
    # source: 0=timer, 1=manual, 2=email
    source           = Column(Integer, nullable=False, default=0)
    paused_at        = Column(DateTime, nullable=True)
    paused_seconds   = Column(Float, nullable=False, default=0)

class DayNote(Base):
    __tablename__ = "day_notes"
    id         = Column(Integer, primary_key=True, index=True)
    date       = Column(Date, nullable=False, unique=True)
    note       = Column(Text, nullable=True)
    mood       = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MailLog(Base):
    __tablename__ = "mail_log"
    id         = Column(Integer, primary_key=True, index=True)
    direction  = Column(String(10), nullable=False)   # "in" | "out"
    subject    = Column(String(500), nullable=True)
    status     = Column(String(50), nullable=False)   # "ok" | "error" | "parsed"
    detail     = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Project(Base):
    __tablename__ = "projects"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(200), nullable=False, unique=True)
    color      = Column(String(20), nullable=False, default="#c8f060")
    position   = Column(Integer, nullable=False, default=0)
    active     = Column(Integer, nullable=False, default=1)  # 1=active, 0=archived
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def _migrate_columns():
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(time_entries)")}
        if "paused_at" not in cols:
            conn.exec_driver_sql("ALTER TABLE time_entries ADD COLUMN paused_at DATETIME")
        if "paused_seconds" not in cols:
            conn.exec_driver_sql("ALTER TABLE time_entries ADD COLUMN paused_seconds FLOAT NOT NULL DEFAULT 0")
        conn.commit()

_migrate_columns()


# ── Seed default projects ─────────────────────────────────────────────────────
def _seed_projects():
    defaults = [
        ("Allgemein",      "#888880", 0),
        ("Entwicklung",    "#c8f060", 1),
        ("Meeting",        "#6699ff", 2),
        ("Planung",        "#ffaa00", 3),
        ("Support",        "#ff4444", 4),
        ("Dokumentation",  "#44bbff", 5),
    ]
    db = SessionLocal()
    try:
        if db.query(Project).count() == 0:
            for name, color, pos in defaults:
                db.add(Project(name=name, color=color, position=pos, active=1))
            db.commit()
    finally:
        db.close()

_seed_projects()


# ── Schemas ─────────────────────────────────────────────────────────────────────

class TimeEntryCreate(BaseModel):
    project: Optional[str] = "Allgemein"
    description: Optional[str] = None

class TimeEntryManual(BaseModel):
    date: date
    start_time: str
    end_time: str
    project: Optional[str] = "Allgemein"
    description: Optional[str] = None

class TimeEntryUpdate(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    project: Optional[str] = None
    description: Optional[str] = None

class TimeEntryOut(BaseModel):
    id: int
    start_time: datetime
    end_time: Optional[datetime]
    duration_minutes: Optional[float]
    date: date
    project: Optional[str]
    description: Optional[str]
    source: int   # 0=timer 1=manual 2=email
    paused_at: Optional[datetime]
    paused_seconds: float
    model_config = {"from_attributes": True}

class DayNoteUpsert(BaseModel):
    note: Optional[str] = None
    mood: Optional[int] = None

class DayNoteOut(BaseModel):
    id: int
    date: date
    note: Optional[str]
    mood: Optional[int]
    updated_at: datetime
    model_config = {"from_attributes": True}

class DaySummary(BaseModel):
    date: date
    total_minutes: float
    entries: List[TimeEntryOut]
    note: Optional[DayNoteOut]
    active_entry: Optional[TimeEntryOut]

class ProjectOut(BaseModel):
    id: int
    name: str
    color: str
    position: int
    active: int
    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    color: str = "#c8f060"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    active: Optional[int] = None


class MailLogOut(BaseModel):
    id: int
    direction: str
    subject: Optional[str]
    status: str
    detail: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}

class SendReportRequest(BaseModel):
    day: date
    recipient: Optional[str] = None   # overrides MAIL_TO env


# ── Mail config helpers ─────────────────────────────────────────────────────────

def smtp_cfg():
    return {
        "host":     os.getenv("SMTP_HOST", ""),
        "port":     int(os.getenv("SMTP_PORT", "587")),
        "user":     os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from":     os.getenv("MAIL_FROM", os.getenv("SMTP_USER", "")),
        "to":       os.getenv("MAIL_TO", ""),
        "use_tls":  os.getenv("SMTP_TLS", "true").lower() == "true",
    }

def imap_cfg():
    return {
        "host":     os.getenv("IMAP_HOST", ""),
        "port":     int(os.getenv("IMAP_PORT", "993")),
        "user":     os.getenv("IMAP_USER", ""),
        "password": os.getenv("IMAP_PASSWORD", ""),
        "folder":   os.getenv("IMAP_FOLDER", "INBOX"),
        "interval": int(os.getenv("IMAP_POLL_INTERVAL", "300")),  # seconds
    }

def mail_configured():
    c = smtp_cfg()
    return bool(c["host"] and c["user"] and c["password"] and c["to"])


# ── App ─────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Epoch API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _parse_hhmm(day: date, hhmm: str) -> datetime:
    try:
        h, m = hhmm.strip().split(":")
        return datetime(day.year, day.month, day.day, int(h), int(m))
    except Exception:
        raise HTTPException(400, f"Ungültiges Zeitformat '{hhmm}', erwartet HH:MM")

def _calc_duration(start: datetime, end: datetime) -> float:
    delta = end - start
    if delta.total_seconds() < 0:
        raise HTTPException(400, "Endzeit muss nach Startzeit liegen")
    return delta.total_seconds() / 60


# ── Health ──────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


# ── Timer ───────────────────────────────────────────────────────────────────────

@app.post("/api/timer/start", response_model=TimeEntryOut)
def start_timer(body: TimeEntryCreate, db: Session = Depends(get_db)):
    if db.query(TimeEntry).filter(TimeEntry.end_time == None).first():
        raise HTTPException(400, "Ein Timer läuft bereits")
    e = TimeEntry(start_time=datetime.utcnow(), date=date.today(),
                  project=body.project or "Allgemein", description=body.description, source=0)
    db.add(e); db.commit(); db.refresh(e)
    return e

@app.post("/api/timer/pause", response_model=TimeEntryOut)
def pause_timer(db: Session = Depends(get_db)):
    active = db.query(TimeEntry).filter(TimeEntry.end_time == None).first()
    if not active:
        raise HTTPException(404, "Kein aktiver Timer")
    if active.paused_at is not None:
        raise HTTPException(400, "Timer ist bereits pausiert")
    active.paused_at = datetime.utcnow()
    db.commit(); db.refresh(active)
    return active

@app.post("/api/timer/resume", response_model=TimeEntryOut)
def resume_timer(db: Session = Depends(get_db)):
    active = db.query(TimeEntry).filter(TimeEntry.end_time == None).first()
    if not active:
        raise HTTPException(404, "Kein aktiver Timer")
    if active.paused_at is None:
        raise HTTPException(400, "Timer ist nicht pausiert")
    active.paused_seconds += (datetime.utcnow() - active.paused_at).total_seconds()
    active.paused_at = None
    db.commit(); db.refresh(active)
    return active

@app.post("/api/timer/stop", response_model=TimeEntryOut)
def stop_timer(db: Session = Depends(get_db)):
    active = db.query(TimeEntry).filter(TimeEntry.end_time == None).first()
    if not active:
        raise HTTPException(404, "Kein aktiver Timer")
    now = datetime.utcnow()
    if active.paused_at is not None:
        active.paused_seconds += (now - active.paused_at).total_seconds()
        active.paused_at = None
    active.end_time = now
    active.duration_minutes = (now - active.start_time).total_seconds() / 60 - active.paused_seconds / 60
    db.commit(); db.refresh(active)
    return active

@app.get("/api/timer/active", response_model=Optional[TimeEntryOut])
def get_active(db: Session = Depends(get_db)):
    return db.query(TimeEntry).filter(TimeEntry.end_time == None).first()


# ── Entries ─────────────────────────────────────────────────────────────────────

@app.post("/api/entries/manual", response_model=TimeEntryOut)
def create_manual(body: TimeEntryManual, db: Session = Depends(get_db)):
    start_dt = _parse_hhmm(body.date, body.start_time)
    end_dt   = _parse_hhmm(body.date, body.end_time)
    e = TimeEntry(start_time=start_dt, end_time=end_dt,
                  duration_minutes=_calc_duration(start_dt, end_dt),
                  date=body.date, project=body.project or "Allgemein",
                  description=body.description, source=1)
    db.add(e); db.commit(); db.refresh(e)
    return e

@app.put("/api/entries/{entry_id}", response_model=TimeEntryOut)
def update_entry(entry_id: int, body: TimeEntryUpdate, db: Session = Depends(get_db)):
    e = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not e: raise HTTPException(404, "Eintrag nicht gefunden")
    if body.project is not None: e.project = body.project
    if body.description is not None: e.description = body.description
    if body.start_time or body.end_time:
        ns = _parse_hhmm(e.date, body.start_time) if body.start_time else e.start_time
        ne = _parse_hhmm(e.date, body.end_time)   if body.end_time   else e.end_time
        if ne: e.duration_minutes = _calc_duration(ns, ne); e.end_time = ne
        e.start_time = ns
    db.commit(); db.refresh(e)
    return e

@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not e: raise HTTPException(404, "Eintrag nicht gefunden")
    db.delete(e); db.commit()
    return {"ok": True}

@app.get("/api/entries", response_model=List[TimeEntryOut])
def get_entries(from_date: Optional[date]=None, to_date: Optional[date]=None, db: Session = Depends(get_db)):
    q = db.query(TimeEntry)
    if from_date: q = q.filter(TimeEntry.date >= from_date)
    if to_date:   q = q.filter(TimeEntry.date <= to_date)
    return q.order_by(TimeEntry.date.desc(), TimeEntry.start_time.desc()).all()


# ── Day / Week ──────────────────────────────────────────────────────────────────

@app.get("/api/day/{day}", response_model=DaySummary)
def get_day(day: date, db: Session = Depends(get_db)):
    entries = db.query(TimeEntry).filter(TimeEntry.date == day).order_by(TimeEntry.start_time).all()
    note    = db.query(DayNote).filter(DayNote.date == day).first()
    active  = db.query(TimeEntry).filter(TimeEntry.end_time == None, TimeEntry.date == day).first()
    return DaySummary(date=day, total_minutes=sum(e.duration_minutes or 0 for e in entries if e.end_time),
                      entries=entries, note=note, active_entry=active)

@app.get("/api/week", response_model=List[DaySummary])
def get_week(start: Optional[date]=None, db: Session = Depends(get_db)):
    if not start:
        today = date.today(); start = today - timedelta(days=today.weekday())
    result = []
    for i in range(7):
        d = start + timedelta(days=i)
        entries = db.query(TimeEntry).filter(TimeEntry.date == d).order_by(TimeEntry.start_time).all()
        note    = db.query(DayNote).filter(DayNote.date == d).first()
        active  = db.query(TimeEntry).filter(TimeEntry.end_time == None, TimeEntry.date == d).first()
        result.append(DaySummary(date=d, total_minutes=sum(e.duration_minutes or 0 for e in entries if e.end_time),
                                 entries=entries, note=note, active_entry=active))
    return result


# ── Notes ───────────────────────────────────────────────────────────────────────

@app.put("/api/notes/{day}", response_model=DayNoteOut)
def upsert_note(day: date, body: DayNoteUpsert, db: Session = Depends(get_db)):
    n = db.query(DayNote).filter(DayNote.date == day).first()
    if n:
        if body.note is not None: n.note = body.note
        if body.mood is not None: n.mood = body.mood
        n.updated_at = datetime.utcnow()
    else:
        n = DayNote(date=day, note=body.note, mood=body.mood, updated_at=datetime.utcnow())
        db.add(n)
    db.commit(); db.refresh(n)
    return n


# ── Stats ───────────────────────────────────────────────────────────────────────

@app.get("/api/stats/monthly")
def monthly_stats(year: int, month: int, db: Session = Depends(get_db)):
    fd = date(year, month, 1)
    td = date(year, month+1, 1) - timedelta(days=1) if month < 12 else date(year+1, 1, 1) - timedelta(days=1)
    entries = db.query(TimeEntry).filter(TimeEntry.date >= fd, TimeEntry.date <= td, TimeEntry.end_time != None).all()
    total = sum(e.duration_minutes or 0 for e in entries)
    by_project: dict = {}
    for e in entries:
        p = e.project or "Allgemein"
        by_project[p] = by_project.get(p, 0) + (e.duration_minutes or 0)
    return {"total_minutes": total, "total_hours": round(total/60, 2),
            "working_days": len(set(e.date for e in entries)), "by_project": by_project}


# ── Export ──────────────────────────────────────────────────────────────────────

SOURCE_LABELS = {0: "Timer", 1: "Manuell", 2: "E-Mail"}

@app.get("/api/export/csv")
def export_csv(from_date: Optional[date]=None, to_date: Optional[date]=None, db: Session = Depends(get_db)):
    q = db.query(TimeEntry).filter(TimeEntry.end_time != None)
    if from_date: q = q.filter(TimeEntry.date >= from_date)
    if to_date:   q = q.filter(TimeEntry.date <= to_date)
    entries = q.order_by(TimeEntry.date, TimeEntry.start_time).all()
    weekdays = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"]
    out = io.StringIO()
    w = csv.writer(out, delimiter=";")
    w.writerow(["Datum","Wochentag","Start","Ende","Dauer_Minuten","Dauer_Stunden","Projekt","Beschreibung","Quelle"])
    for e in entries:
        w.writerow([e.date.strftime("%d.%m.%Y"), weekdays[e.start_time.weekday()],
                    e.start_time.strftime("%H:%M"), e.end_time.strftime("%H:%M"),
                    round(e.duration_minutes or 0, 2), round((e.duration_minutes or 0)/60, 2),
                    e.project or "Allgemein", e.description or "", SOURCE_LABELS.get(e.source, "?")])
    out.seek(0)
    fn = f"zeiterfassung_{from_date or 'alle'}_bis_{to_date or 'heute'}.csv"
    return StreamingResponse(iter([out.getvalue().encode("utf-8-sig")]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})

@app.get("/api/export/json")
def export_json(from_date: Optional[date]=None, to_date: Optional[date]=None, db: Session = Depends(get_db)):
    q = db.query(TimeEntry).filter(TimeEntry.end_time != None)
    if from_date: q = q.filter(TimeEntry.date >= from_date)
    if to_date:   q = q.filter(TimeEntry.date <= to_date)
    entries = q.order_by(TimeEntry.date, TimeEntry.start_time).all()
    nq = db.query(DayNote)
    if from_date: nq = nq.filter(DayNote.date >= from_date)
    if to_date:   nq = nq.filter(DayNote.date <= to_date)
    notes = {str(n.date): {"note": n.note, "mood": n.mood} for n in nq.all()}
    total = sum(e.duration_minutes or 0 for e in entries)
    data = {"exported_at": datetime.utcnow().isoformat()+"Z",
            "filter": {"from": str(from_date) if from_date else None, "to": str(to_date) if to_date else None},
            "summary": {"total_entries": len(entries), "total_minutes": round(total,2), "total_hours": round(total/60,2)},
            "entries": [{"id": e.id, "date": str(e.date), "start_time": e.start_time.strftime("%H:%M"),
                         "end_time": e.end_time.strftime("%H:%M"),
                         "duration_minutes": round(e.duration_minutes or 0, 2),
                         "duration_hours": round((e.duration_minutes or 0)/60, 2),
                         "project": e.project or "Allgemein", "description": e.description or "",
                         "source": SOURCE_LABELS.get(e.source, "?")} for e in entries],
            "day_notes": notes}
    fn = f"zeiterfassung_{from_date or 'alle'}_bis_{to_date or 'heute'}.json"
    return StreamingResponse(iter([json_lib.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")]),
                             media_type="application/json",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


# ── Projects ─────────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=List[ProjectOut])
def get_projects(include_archived: bool = False, db: Session = Depends(get_db)):
    q = db.query(Project)
    if not include_archived:
        q = q.filter(Project.active == 1)
    return q.order_by(Project.position, Project.name).all()


@app.post("/api/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    if db.query(Project).filter(Project.name == body.name).first():
        raise HTTPException(400, f"Projekt '{body.name}' existiert bereits")
    max_pos = db.query(Project).count()
    p = Project(name=body.name.strip(), color=body.color, position=max_pos, active=1)
    db.add(p); db.commit(); db.refresh(p)
    return p


@app.put("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, body: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p: raise HTTPException(404, "Projekt nicht gefunden")
    if body.name is not None:
        existing = db.query(Project).filter(Project.name == body.name, Project.id != project_id).first()
        if existing: raise HTTPException(400, f"Projekt '{body.name}' existiert bereits")
        p.name = body.name.strip()
    if body.color    is not None: p.color    = body.color
    if body.position is not None: p.position = body.position
    if body.active   is not None: p.active   = body.active
    db.commit(); db.refresh(p)
    return p


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p: raise HTTPException(404, "Projekt nicht gefunden")
    used = db.query(TimeEntry).filter(TimeEntry.project == p.name).count()
    if used > 0:
        raise HTTPException(400, f"Projekt wird von {used} Eintr\u00e4gen verwendet \u2014 erst archivieren")
    db.delete(p); db.commit()
    return {"ok": True}


@app.put("/api/projects/reorder", response_model=List[ProjectOut])
def reorder_projects(order: List[int], db: Session = Depends(get_db)):
    for pos, pid in enumerate(order):
        p = db.query(Project).filter(Project.id == pid).first()
        if p: p.position = pos
    db.commit()
    return db.query(Project).filter(Project.active == 1).order_by(Project.position).all()


# ── Mail: outbound (SMTP) ────────────────────────────────────────────────────────

def _build_report_html(day: date, entries: list, note, total_minutes: float) -> str:
    weekdays = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"]
    wday = weekdays[day.weekday()]
    h = int(total_minutes // 60); m = int(total_minutes % 60)
    total_str = f"{h}h {m}min" if h else f"{m}min"
    rows = ""
    for e in entries:
        if not e.end_time: continue
        rows += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;font-family:monospace;color:#888;">{e.date.strftime('%Y-%m-%d')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;font-family:monospace;color:#888;">{e.start_time.strftime('%H:%M')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;font-family:monospace;color:#888;">{e.end_time.strftime('%H:%M')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;">{e.project or 'Allgemein'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#888;">{e.description or ''}</td>
        </tr>"""

    mood_str = ""
    if note and note.mood:
        moods = ["😞","😕","😐","🙂","😄"]
        mood_str = moods[note.mood - 1] + " "

    note_html = ""
    if note and note.note:
        note_html = f"""
        <div style="margin-top:24px;padding:16px;background:#1a1a1a;border-left:3px solid #c8f060;border-radius:4px;">
          <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Tagesnotiz</div>
          <div style="color:#e8e4dc;">{mood_str}{note.note}</div>
        </div>"""

    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="background:#0a0a0a;color:#e8e4dc;font-family:'Helvetica Neue',Arial,sans-serif;padding:32px;margin:0;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">Tagesreport</div>
      <h1 style="font-size:28px;font-weight:800;letter-spacing:-0.03em;color:#e8e4dc;margin:0;">{wday}, {day.strftime('%d. %m. %Y')}</h1>
    </div>
    <div style="background:#c8f060;color:#0a0a0a;display:inline-block;padding:8px 16px;border-radius:4px;font-family:monospace;font-size:18px;font-weight:500;margin-bottom:24px;">{total_str}</div>
    <table style="width:100%;border-collapse:collapse;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#1a1a1a;">
          <th style="padding:10px 12px;text-align:left;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.1em;font-weight:400;">Datum</th>
          <th style="padding:10px 12px;text-align:left;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.1em;font-weight:400;">Start</th>
          <th style="padding:10px 12px;text-align:left;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.1em;font-weight:400;">Ende</th>
          <th style="padding:10px 12px;text-align:left;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.1em;font-weight:400;">Projekt</th>
          <th style="padding:10px 12px;text-align:left;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.1em;font-weight:400;">Beschreibung</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    {note_html}
    <div style="margin-top:32px;font-size:11px;color:#444;border-top:1px solid #1a1a1a;padding-top:16px;">
      Gesendet von Epoch · {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC
    </div>
  </div>
</body></html>"""


def _build_error_reply_html(original_subject: str, err: "MailParseError") -> str:
    """HTML body for the error reply mail sent back to the sender."""
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="background:#0a0a0a;color:#e8e4dc;font-family:'Helvetica Neue',Arial,sans-serif;padding:32px;margin:0;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="margin-bottom:20px;">
      <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">Epoch · Import fehlgeschlagen</div>
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#ff4444;margin:0;">Fehler beim Importieren</h1>
    </div>

    <div style="background:#1a1a1a;border-left:3px solid #ff4444;border-radius:4px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Fehlermeldung</div>
      <div style="font-family:monospace;font-size:13px;color:#ff6666;white-space:pre-wrap;">{err.user_message()}</div>
    </div>

    <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Korrektes Format</div>
      <div style="font-family:monospace;font-size:12px;color:#888;line-height:2;">
        <span style="color:#555;">Datum&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> |
        <span style="color:#555;"> Start </span> |
        <span style="color:#555;"> Ende&nbsp; </span> |
        <span style="color:#555;"> Projekt&nbsp;&nbsp;&nbsp;&nbsp; </span> |
        <span style="color:#555;"> Beschreibung</span><br>
        <span style="color:#c8f060;">2026-06-01</span> |
        <span style="color:#c8f060;"> 09:00 </span> |
        <span style="color:#c8f060;"> 10:00 </span> |
        <span style="color:#c8f060;"> Entwicklung </span> |
        <span style="color:#c8f060;"> Auth-System implementieren</span><br>
        <span style="color:#c8f060;">2026-06-01</span> |
        <span style="color:#c8f060;"> 10:30 </span> |
        <span style="color:#c8f060;"> 12:00 </span> |
        <span style="color:#c8f060;"> Meeting&nbsp;&nbsp;&nbsp;&nbsp; </span> |
        <span style="color:#c8f060;"> Sprint Planning</span>
      </div>
      <div style="margin-top:12px;font-size:11px;color:#555;line-height:1.8;">
        Alle 5 Spalten sind Pflicht · Trennzeichen: Pipe ( | )<br>
        Datum: YYYY-MM-DD · Zeiten: HH:MM · Beschreibung darf nicht leer sein<br>
        Zeilen die mit &gt; oder # beginnen werden ignoriert
      </div>
    </div>

    <div style="font-size:11px;color:#444;border-top:1px solid #1a1a1a;padding-top:14px;">
      Keine Einträge wurden importiert · Epoch · {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC
    </div>
  </div>
</body></html>"""


def _send_smtp(subject: str, html_body: str, recipient: Optional[str] = None) -> None:
    cfg = smtp_cfg()
    if not cfg["host"]: raise ValueError("SMTP nicht konfiguriert")
    to = recipient or cfg["to"]
    if not to: raise ValueError("Kein Empfänger konfiguriert")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = cfg["from"]
    msg["To"]      = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    ctx = ssl.create_default_context()
    if cfg["use_tls"]:
        with smtplib.SMTP(cfg["host"], cfg["port"]) as s:
            s.starttls(context=ctx)
            s.login(cfg["user"], cfg["password"])
            s.sendmail(cfg["from"], to, msg.as_string())
    else:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ctx) as s:
            s.login(cfg["user"], cfg["password"])
            s.sendmail(cfg["from"], to, msg.as_string())


@app.post("/api/mail/send-report")
def send_report(body: SendReportRequest, db: Session = Depends(get_db)):
    entries = db.query(TimeEntry).filter(TimeEntry.date == body.day).order_by(TimeEntry.start_time).all()
    note    = db.query(DayNote).filter(DayNote.date == body.day).first()
    total   = sum(e.duration_minutes or 0 for e in entries if e.end_time)

    weekdays = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"]
    subject  = f"Tagesreport – {weekdays[body.day.weekday()]}, {body.day.strftime('%d.%m.%Y')}"
    html     = _build_report_html(body.day, entries, note, total)

    try:
        _send_smtp(subject, html, body.recipient)
        _log_mail(db, "out", subject, "ok", f"Gesendet an {body.recipient or smtp_cfg()['to']}")
        return {"ok": True, "message": "E-Mail gesendet"}
    except Exception as ex:
        _log_mail(db, "out", subject, "error", str(ex))
        raise HTTPException(500, f"Senden fehlgeschlagen: {ex}")


# ── Mail: inbound (IMAP parsing) ─────────────────────────────────────────────────

# Required format – one entry per line, always 5 pipe-separated columns:
#   Datum      | Start | Ende  | Projekt     | Beschreibung
#   2026-06-01 | 09:00 | 10:00 | Support     | Planung Roadmap Q3
#   2026-06-01 | 09:00 | 10:00 | Entwicklung | Auth-System implementieren
#
# ALL 5 columns are mandatory. Column 4 is ALWAYS the project.
# Column 5 (Beschreibung) must be non-empty.
# Lines starting with > or # are ignored (quoted replies, comments).
# A single invalid line causes the entire mail to be rejected.
PIPE_RE_FULL = re.compile(
    r'(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.+)',
    re.UNICODE
)
# Patterns used to diagnose specific errors
PIPE_DATE_RE   = re.compile(r'\d{4}-\d{2}-\d{2}')
PIPE_TIME_RE   = re.compile(r'\d{1,2}:\d{2}\s*\|\s*\d{1,2}:\d{2}')
PIPE_COUNT_RE  = re.compile(r'\|')


class MailParseError(Exception):
    """Raised when a mail line is invalid. Contains a human-readable explanation."""
    def __init__(self, lineno: int, line: str, reason: str):
        self.lineno = lineno
        self.line   = line
        self.reason = reason
        super().__init__(f"Zeile {lineno}: {reason}")

    def user_message(self) -> str:
        return (
            f"Zeile {self.lineno}: {self.reason}\n"
            f"  Inhalt: {self.line}\n"
            f"  Erwartet: YYYY-MM-DD | HH:MM | HH:MM | Projekt | Beschreibung"
        )


def _diagnose_line(line: str) -> str:
    """Return a specific error reason for a line that failed full validation."""
    pipes = PIPE_COUNT_RE.findall(line)
    n = len(pipes)

    if n == 0:
        return "Keine Pipe-Trennzeichen gefunden — alle 5 Spalten sind Pflicht"
    if n < 4:
        return f"Nur {n} von 4 erforderlichen '|' Trennzeichen gefunden — alle 5 Spalten sind Pflicht"

    # Has enough pipes, check individual columns
    parts = [p.strip() for p in line.split("|")]
    if len(parts) >= 1 and not PIPE_DATE_RE.match(parts[0]):
        return f"Spalte 1 (Datum) ungültig: '{parts[0]}' — erwartet YYYY-MM-DD"
    if len(parts) >= 2 and not re.match(r'\d{1,2}:\d{2}', parts[1]):
        return f"Spalte 2 (Start) ungültig: '{parts[1]}' — erwartet HH:MM"
    if len(parts) >= 3 and not re.match(r'\d{1,2}:\d{2}', parts[2]):
        return f"Spalte 3 (Ende) ungültig: '{parts[2]}' — erwartet HH:MM"
    if len(parts) >= 4 and not parts[3]:
        return "Spalte 4 (Projekt) ist leer"
    if len(parts) >= 5 and not parts[4]:
        return "Spalte 5 (Beschreibung) ist leer — Beschreibung ist Pflicht"
    if len(parts) < 5:
        return "Spalte 5 (Beschreibung) fehlt — Beschreibung ist Pflicht"

    return "Ungültiges Format"


def _parse_mail_body(text: str, fallback_date: date) -> list:
    """Parse pipe-separated lines: Datum | Start | Ende | Projekt | Beschreibung

    All 5 columns are mandatory. Raises MailParseError on the first invalid line.
    Lines starting with > or # are ignored (quoted replies, comments).
    """
    results = []
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith(">") or line.startswith("#"):
            continue
        m = PIPE_RE_FULL.match(line)
        if not m:
            reason = _diagnose_line(line)
            raise MailParseError(lineno, line, reason)
        raw_date, start_s, end_s, project, description = m.groups()
        try:
            entry_date = date.fromisoformat(raw_date.strip())
        except ValueError:
            raise MailParseError(lineno, line, f"Ungültiges Datum: '{raw_date.strip()}'")

        # Validate time values (regex allows 25:00 etc., catch here)
        for col, label, val in [(2, "Start", start_s.strip()), (3, "Ende", end_s.strip())]:
            h, m = val.split(":")
            if not (0 <= int(h) <= 23 and 0 <= int(m) <= 59):
                raise MailParseError(lineno, line,
                    f"Spalte {col} ({label}) ungültige Uhrzeit: '{val}' — erwartet HH:MM (00:00–23:59)")

        results.append({
            "date":        entry_date,
            "start":       start_s.strip(),
            "end":         end_s.strip(),
            "project":     project.strip() or "Allgemein",
            "description": description.strip(),
        })
    return results


def _get_mail_text(msg) -> str:
    """Extract plain text from email message."""
    text = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    text += part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                except Exception:
                    pass
    else:
        try:
            text = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            pass
    return text


def _log_mail(db: Session, direction: str, subject: str, status: str, detail: str = ""):
    ml = MailLog(direction=direction, subject=subject, status=status, detail=detail)
    db.add(ml); db.commit()


def poll_imap_once():
    """Synchronously poll IMAP for new messages. Called from background thread."""
    cfg = imap_cfg()
    if not cfg["host"] or not cfg["user"]:
        return

    db = SessionLocal()
    try:
        imap = imaplib.IMAP4_SSL(cfg["host"], cfg["port"])
        imap.login(cfg["user"], cfg["password"])
        imap.select(cfg["folder"])

        # Search for unseen messages
        status, data = imap.search(None, "UNSEEN")
        if status != "OK":
            imap.logout(); return

        uids = data[0].split()
        if not uids:
            imap.logout(); return

        log.info(f"IMAP: {len(uids)} neue Nachricht(en)")

        for uid in uids:
            try:
                status, raw = imap.fetch(uid, "(RFC822)")
                if status != "OK": continue
                msg = email_lib.message_from_bytes(raw[0][1])
                subject = msg.get("Subject", "(kein Betreff)")
                date_str = msg.get("Date", "")

                # Try to parse date from mail header, fall back to today
                try:
                    from email.utils import parsedate_to_datetime
                    mail_date = parsedate_to_datetime(date_str).date()
                except Exception:
                    mail_date = date.today()

                body      = _get_mail_text(msg)
                full_text = subject + "\n" + body
                sender    = email_lib.utils.parseaddr(msg.get("From", ""))[1]

                # Parse – any error rejects the entire mail
                try:
                    entries = _parse_mail_body(full_text, mail_date)
                except MailParseError as parse_err:
                    err_detail = parse_err.user_message()
                    log.warning(f"Mail abgelehnt: {err_detail}")
                    _log_mail(db, "in", subject, "error", err_detail)

                    # Send error reply if SMTP is configured and sender is known
                    if mail_configured() and sender:
                        try:
                            err_html = _build_error_reply_html(subject, parse_err)
                            _send_smtp(
                                subject=f"Re: {subject} — Fehler beim Import",
                                html_body=err_html,
                                recipient=sender,
                            )
                            _log_mail(db, "out", f"Re: {subject} — Fehler beim Import",
                                      "ok", f"Fehler-Mail gesendet an {sender}")
                        except Exception as smtp_ex:
                            log.error(f"Fehler-Mail konnte nicht gesendet werden: {smtp_ex}")
                    imap.store(uid, "+FLAGS", "\\Seen")
                    continue

                if not entries:
                    _log_mail(db, "in", subject, "error",
                              "Keine Zeiteinträge gefunden — Mail enthält keine gültigen Zeilen")
                    imap.store(uid, "+FLAGS", "\\Seen")
                    continue

                # All entries valid – commit all at once
                for ep in entries:
                    start_dt = _parse_hhmm(ep["date"], ep["start"])
                    end_dt   = _parse_hhmm(ep["date"], ep["end"])
                    dur      = _calc_duration(start_dt, end_dt)
                    db.add(TimeEntry(
                        start_time=start_dt, end_time=end_dt, duration_minutes=dur,
                        date=ep["date"], project=ep["project"],
                        description=ep["description"], source=2,
                    ))
                db.commit()
                _log_mail(db, "in", subject, "parsed",
                          f"{len(entries)} Eintrag/Einträge erstellt")
                imap.store(uid, "+FLAGS", "\\Seen")

            except Exception as ex:
                log.error(f"Fehler beim Verarbeiten von Mail {uid}: {ex}")
                _log_mail(db, "in", "?", "error", str(ex))

        imap.logout()
    except Exception as ex:
        log.error(f"IMAP-Verbindungsfehler: {ex}")
        try: _log_mail(db, "in", "?", "error", f"Verbindung fehlgeschlagen: {ex}")
        except Exception: pass
    finally:
        db.close()


# ── Mail log endpoints ───────────────────────────────────────────────────────────

@app.get("/api/mail/log", response_model=List[MailLogOut])
def get_mail_log(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(MailLog).order_by(MailLog.created_at.desc()).limit(limit).all()

@app.get("/api/mail/config")
def get_mail_config():
    """Return sanitised config (no passwords) so the frontend can show status."""
    sc = smtp_cfg(); ic = imap_cfg()
    return {
        "smtp": {"host": sc["host"], "port": sc["port"], "user": sc["user"],
                 "from": sc["from"], "to": sc["to"], "configured": bool(sc["host"] and sc["user"])},
        "imap": {"host": ic["host"], "port": ic["port"], "user": ic["user"],
                 "folder": ic["folder"], "interval": ic["interval"],
                 "configured": bool(ic["host"] and ic["user"])},
    }

@app.post("/api/mail/poll")
def trigger_poll():
    """Manually trigger an IMAP poll (for testing)."""
    try:
        poll_imap_once()
        return {"ok": True}
    except Exception as ex:
        raise HTTPException(500, str(ex))


# ── Background IMAP polling loop ─────────────────────────────────────────────────

async def _imap_loop():
    while True:
        cfg = imap_cfg()
        interval = cfg["interval"]
        if cfg["host"] and cfg["user"]:
            try:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, poll_imap_once)
            except Exception as ex:
                log.error(f"IMAP loop error: {ex}")
        await asyncio.sleep(interval)

@app.on_event("startup")
async def startup():
    asyncio.create_task(_imap_loop())


# ── Stats ── (monthly already above, add mail stats) ─────────────────────────────

@app.get("/api/stats/mail")
def mail_stats(db: Session = Depends(get_db)):
    total_in  = db.query(MailLog).filter(MailLog.direction == "in").count()
    total_out = db.query(MailLog).filter(MailLog.direction == "out").count()
    ok_in     = db.query(MailLog).filter(MailLog.direction == "in", MailLog.status == "parsed").count()
    email_entries = db.query(TimeEntry).filter(TimeEntry.source == 2).count()
    return {"mails_received": total_in, "mails_parsed": ok_in,
            "mails_sent": total_out, "entries_via_email": email_entries}
