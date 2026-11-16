import os
import uuid
import threading
import json
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, BackgroundTasks, Response
from fastapi.responses import FileResponse, StreamingResponse
import io


from pronunciation_service import (
    clean_markdown_text,
    parse_subtitle_items,
    extract_translations_from_bilingual_md,
    process_pronunciation_to_mp3,
    get_available_voices,
    get_speech_segment
)

router = APIRouter(prefix="/api/pronunciation", tags=["Pronunciation"])

OUTPUTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "outputs"))
os.makedirs(OUTPUTS_DIR, exist_ok=True)

SUBTITLES_DIR = r"c:\Users\javie\Documents\lectordesubtitulos\subtitulos"

# In-memory job progress tracking
jobs = {}

class ParseRequest(BaseModel):
    text: str
    remove_bullets: bool = True
    remove_brackets: bool = True
    start_marker: Optional[str] = None

class ParseResponse(BaseModel):
    phrases: List[str]
    count: int
    items: Optional[List[dict]] = None
    has_timestamps: Optional[bool] = False

class LoadSubtitlesRequest(BaseModel):
    subtitle_file: str = "subtitulos_ingles.md"
    audio_file: Optional[str] = "audio_extraido.mp3"
    remove_bullets: bool = True
    remove_brackets: bool = True
    start_marker: Optional[str] = None

class PreviewRequest(BaseModel):
    text: str
    voice: Optional[str] = "kokoro-af_heart"
    engine: Optional[str] = "auto"
    speed: Optional[float] = 1.0

class GenerateRequest(BaseModel):
    phrases: List[str]
    repetitions: int = 3
    silence_rep_ms: int = 1500
    silence_phrase_ms: int = 2000
    voice: str = "kokoro-af_heart"
    engine: str = "auto"
    speed: Optional[float] = 1.0


def _load_default_translations_map() -> dict:
    """Carga el mapa de traducciones desde subtitulos_extraidos.md si existe."""
    bilingual_path = os.path.join(SUBTITLES_DIR, "subtitulos_extraidos.md")
    if os.path.exists(bilingual_path):
        try:
            with open(bilingual_path, "r", encoding="utf-8", errors="replace") as f:
                return extract_translations_from_bilingual_md(f.read())
        except Exception:
            pass
    return {}


@router.get("/voices")
def list_voices():
    """Devuelve las voces y motores disponibles."""
    return get_available_voices()


@router.post("/parse", response_model=ParseResponse)
def parse_text(req: ParseRequest):
    """Limpia el texto o archivo Markdown y devuelve las frases estructuradas con marcas de tiempo."""
    translations_map = _load_default_translations_map()
    items = parse_subtitle_items(
        req.text,
        remove_bullets=req.remove_bullets,
        remove_brackets=req.remove_brackets,
        start_marker=req.start_marker,
        clean_ocr=True,
        translations_map=translations_map
    )
    phrases = [it["text"] for it in items]
    has_ts = any(it.get("start_time") is not None for it in items)
    return ParseResponse(
        phrases=phrases,
        count=len(phrases),
        items=items,
        has_timestamps=has_ts
    )


@router.get("/subtitles/list")
def list_subtitles_folder():
    """Lista los archivos de subtítulos (.md, .txt) y pistas de audio (.mp3, .wav) disponibles."""
    if not os.path.exists(SUBTITLES_DIR):
        return {"exists": False, "directory": SUBTITLES_DIR, "subtitles": [], "audios": []}

    subtitles = []
    audios = []
    for fname in os.listdir(SUBTITLES_DIR):
        fpath = os.path.join(SUBTITLES_DIR, fname)
        if not os.path.isfile(fpath):
            continue
        ext = os.path.splitext(fname)[1].lower()
        stat = os.stat(fpath)
        info = {
            "name": fname,
            "size_kb": round(stat.st_size / 1024, 1),
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
        }
        if ext in (".md", ".txt", ".srt"):
            subtitles.append(info)
        elif ext in (".mp3", ".wav", ".ogg", ".m4a"):
            audios.append(info)

    # Priorizar subtitulos_ingles.md y subtitulos_extraidos.md arriba
    def sub_sort_key(item):
        if item["name"] == "subtitulos_ingles.md":
            return (0, "")
        if item["name"] == "subtitulos_extraidos.md":
            return (1, "")
        return (2, item["name"].lower())

    subtitles.sort(key=sub_sort_key)
    audios.sort(key=lambda x: (0 if x["name"] == "audio_extraido.mp3" else 1, x["name"].lower()))

    return {
        "exists": True,
        "directory": SUBTITLES_DIR,
        "subtitles": subtitles,
        "audios": audios
    }


@router.post("/subtitles/load")
def load_subtitle_with_audio(req: LoadSubtitlesRequest):
    """Carga un archivo de subtítulos de la carpeta de capturas y lo vincula con su pista de audio original."""
    safe_sub = os.path.basename(req.subtitle_file)
    sub_path = os.path.join(SUBTITLES_DIR, safe_sub)
    if not os.path.exists(sub_path):
        raise HTTPException(status_code=404, detail=f"No se encontró el archivo de subtítulos: {safe_sub}")

    try:
        with open(sub_path, "r", encoding="utf-8", errors="replace") as f:
            raw_content = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo archivo de subtítulos: {str(e)}")

    translations_map = _load_default_translations_map()
    items = parse_subtitle_items(
        raw_content,
        remove_bullets=req.remove_bullets,
        remove_brackets=req.remove_brackets,
        start_marker=req.start_marker,
        clean_ocr=True,
        translations_map=translations_map
    )
    phrases = [it["text"] for it in items]
    has_timestamps = any(it.get("start_time") is not None for it in items)

    # Verificar archivo de audio original
    safe_audio = os.path.basename(req.audio_file) if req.audio_file else "audio_extraido.mp3"
    audio_path = os.path.join(SUBTITLES_DIR, safe_audio)
    has_audio = os.path.exists(audio_path) and os.path.getsize(audio_path) > 0
    audio_url = f"/api/pronunciation/subtitles/audio?file={safe_audio}&t={int(os.path.getmtime(audio_path))}" if has_audio else None

    return {
        "subtitle_file": safe_sub,
        "audio_file": safe_audio if has_audio else None,
        "audio_url": audio_url,
        "has_audio": has_audio,
        "has_timestamps": has_timestamps,
        "raw_text": raw_content,
        "phrases": phrases,
        "items": items,
        "count": len(phrases)
    }


@router.get("/subtitles/audio")
def stream_subtitle_audio(file: str = "audio_extraido.mp3"):
    """Sirve el archivo de audio original con soporte de HTTP Range para saltos de tiempo instantáneos."""
    safe_audio = os.path.basename(file)
    audio_path = os.path.join(SUBTITLES_DIR, safe_audio)
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail=f"Archivo de audio no encontrado: {safe_audio}")

    ext = os.path.splitext(safe_audio)[1].lower()
    media_type = "audio/wav" if ext == ".wav" else "audio/mpeg"
    return FileResponse(path=audio_path, media_type=media_type, filename=safe_audio)



@router.post("/preview")
def preview_speech(req: PreviewRequest):
    """Genera audio para una sola frase al instante para previsualización con velocidad."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="El texto está vacío.")
    try:
        segment = get_speech_segment(
            req.text.strip(),
            voice=req.voice,
            engine=req.engine,
            speed=req.speed if req.speed is not None else 1.0
        )
        buf = io.BytesIO()
        segment.export(buf, format="mp3")
        buf.seek(0)
        return Response(content=buf.getvalue(), media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar previsualización: {str(e)}")

def run_generation_task(job_id: str, req: GenerateRequest, output_file: str):
    """Función en segundo plano para procesar la generación de audio completa con velocidad."""
    try:
        def on_progress(current, total, phrase):
            percent = int((current / total) * 100)
            jobs[job_id]["current"] = current
            jobs[job_id]["total"] = total
            jobs[job_id]["percent"] = percent
            jobs[job_id]["current_phrase"] = phrase

        result = process_pronunciation_to_mp3(
            phrases=req.phrases,
            repetitions=req.repetitions,
            silence_rep_ms=req.silence_rep_ms,
            silence_phrase_ms=req.silence_phrase_ms,
            voice=req.voice,
            engine=req.engine,
            speed=req.speed if req.speed is not None else 1.0,
            output_path=output_file,
            progress_callback=on_progress
        )

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = result
        jobs[job_id]["percent"] = 100
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@router.post("/generate")
def start_generation(req: GenerateRequest):
    """Inicia la generación del archivo de audio concatenado con repeticiones."""
    if not req.phrases:
        raise HTTPException(status_code=400, detail="No hay frases para procesar.")

    job_id = str(uuid.uuid4())[:8]
    output_filename = f"pronunciation_{job_id}.mp3"
    output_path = os.path.join(OUTPUTS_DIR, output_filename)

    jobs[job_id] = {
        "job_id": job_id,
        "status": "processing",
        "current": 0,
        "total": len(req.phrases),
        "percent": 0,
        "current_phrase": req.phrases[0] if req.phrases else "",
        "output_file": output_path,
        "filename": output_filename,
        "result": None,
        "error": None
    }

    thread = threading.Thread(
        target=run_generation_task,
        args=(job_id, req, output_path),
        daemon=True
    )
    thread.start()

    return {"job_id": job_id, "status": "processing", "total_phrases": len(req.phrases)}

@router.get("/status/{job_id}")
def check_status(job_id: str):
    """Consulta el progreso actual de la generación de audio."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Tarea no encontrada.")
    return jobs[job_id]

@router.get("/download/{job_id}")
def download_audio(job_id: str):
    """Descarga el archivo MP3 generado."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Tarea no encontrada.")
    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="El archivo aún no ha terminado de procesarse.")
    
    file_path = job["output_file"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="El archivo no existe en el disco.")

    return FileResponse(
        path=file_path,
        filename="output_pronunciation.mp3",
        media_type="audio/mpeg"
    )

# --- GESTIÓN DE HISTORIAL Y PROGRESO DE PRÁCTICA ---

HISTORY_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "pronunciation_history.json"))

def load_history() -> dict:
    if not os.path.exists(HISTORY_FILE):
        return {}
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_history(history: dict):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error al guardar historial de pronunciación: {e}")

class SessionSaveRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None
    raw_text: str
    phrases: List[str]
    items: Optional[List[dict]] = None
    audio_url: Optional[str] = None
    audio_file: Optional[str] = None
    subtitle_file: Optional[str] = None
    current_phrase_idx: int = 0
    current_repetition: int = 0
    voice: str = "en-US-JennyNeural"
    engine: str = "auto"
    repetitions: int = 3
    silence_rep_ms: int = 1500
    silence_phrase_ms: int = 2000
    remove_brackets: bool = True
    remove_bullets: bool = True

class ProgressUpdateRequest(BaseModel):
    session_id: str
    current_phrase_idx: int
    current_repetition: Optional[int] = 0

@router.get("/history")
def get_all_history():
    """Devuelve las sesiones de práctica ordenadas por la fecha más reciente."""
    history = load_history()
    sessions = list(history.values())
    sessions.sort(key=lambda s: s.get("last_practiced", ""), reverse=True)
    return {"sessions": sessions}

@router.post("/history")
def save_or_update_session(req: SessionSaveRequest):
    """Guarda o actualiza una sesión de práctica completa."""
    history = load_history()
    session_id = req.session_id or str(uuid.uuid4())[:8]
    now_iso = datetime.now().isoformat()
    
    total = len(req.phrases)
    title = req.title
    if not title:
        if req.subtitle_file:
            title = f"🎬 {req.subtitle_file}"
        elif req.phrases:
            first_phrase = req.phrases[0]
            title = first_phrase[:45] + ("..." if len(first_phrase) > 45 else "")
        else:
            title = "Lección de pronunciación"

    pct = int((req.current_phrase_idx / total) * 100) if total > 0 else 0
    curr_phrase = req.phrases[req.current_phrase_idx] if 0 <= req.current_phrase_idx < total else ""

    session_data = {
        "session_id": session_id,
        "title": title,
        "raw_text": req.raw_text,
        "phrases": req.phrases,
        "items": req.items,
        "audio_url": req.audio_url,
        "audio_file": req.audio_file,
        "subtitle_file": req.subtitle_file,
        "total_phrases": total,
        "current_phrase_idx": req.current_phrase_idx,
        "current_repetition": req.current_repetition,
        "current_phrase": curr_phrase,
        "voice": req.voice,
        "engine": req.engine,
        "repetitions": req.repetitions,
        "silence_rep_ms": req.silence_rep_ms,
        "silence_phrase_ms": req.silence_phrase_ms,
        "remove_brackets": req.remove_brackets,
        "remove_bullets": req.remove_bullets,
        "created_at": history.get(session_id, {}).get("created_at", now_iso),
        "last_practiced": now_iso,
        "percent_completed": pct
    }

    history[session_id] = session_data
    save_history(history)
    return session_data

@router.post("/history/progress")
def update_session_progress(req: ProgressUpdateRequest):
    """Actualiza rápidamente el avance de la frase actual para sincronización en tiempo real."""
    history = load_history()
    if req.session_id not in history:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    
    session = history[req.session_id]
    total = session.get("total_phrases", len(session.get("phrases", [])))
    session["current_phrase_idx"] = req.current_phrase_idx
    session["current_repetition"] = req.current_repetition or 0
    session["last_practiced"] = datetime.now().isoformat()
    if 0 <= req.current_phrase_idx < total and session.get("phrases"):
        session["current_phrase"] = session["phrases"][req.current_phrase_idx]
    session["percent_completed"] = int((req.current_phrase_idx / total) * 100) if total > 0 else 0

    history[req.session_id] = session
    save_history(history)
    return {"status": "success", "session": session}

@router.get("/history/{session_id}")
def get_session(session_id: str):
    """Obtiene una sesión específica del historial."""
    history = load_history()
    if session_id not in history:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    return history[session_id]

@router.delete("/history/{session_id}")
def delete_session(session_id: str):
    """Elimina una sesión del historial."""
    history = load_history()
    if session_id in history:
        del history[session_id]
        save_history(history)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Sesión no encontrada.")

