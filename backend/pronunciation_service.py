import asyncio
import io
import os
import re
import sys
import tempfile
import subprocess
import warnings
from typing import List, Dict, Optional, Callable

warnings.filterwarnings("ignore", category=RuntimeWarning)

# Configure ffmpeg for pydub
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_dir = os.path.dirname(ffmpeg_exe)
    if ffmpeg_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
    import pydub
    pydub.AudioSegment.converter = ffmpeg_exe
    from pydub import AudioSegment
except Exception as e:
    print(f"Advertencia al configurar imageio_ffmpeg/pydub: {e}")
    try:
        from pydub import AudioSegment
    except ImportError:
        AudioSegment = None


# Try importing edge-tts and gTTS
try:
    import edge_tts
except ImportError:
    edge_tts = None

try:
    from gtts import gTTS
except ImportError:
    gTTS = None

# Kokoro TTS (Soporta paquete oficial kokoro y kokoro-onnx)
try:
    import soundfile as sf
except ImportError:
    sf = None

_kokoro_pipeline = None
_kokoro_onnx_instance = None

def _ensure_kokoro_models():
    """Verifica y descarga si es necesario los pesos de Kokoro ONNX."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    kokoro_dir = os.path.join(base_dir, "models", "kokoro")
    os.makedirs(kokoro_dir, exist_ok=True)
    model_path = os.path.join(kokoro_dir, "kokoro-v1.0.onnx")
    voices_path = os.path.join(kokoro_dir, "voices-v1.0.bin")

    urls = {
        voices_path: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
        model_path: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
    }
    import urllib.request
    for path, url in urls.items():
        if not os.path.exists(path):
            try:
                print(f"Descargando {os.path.basename(path)} para Kokoro TTS...")
                urllib.request.urlretrieve(url, path)
            except Exception as e:
                print(f"Error descargando {path}: {e}")
                return None, None
    return model_path, voices_path

def _get_kokoro_onnx():
    global _kokoro_onnx_instance
    if _kokoro_onnx_instance is not None:
        return _kokoro_onnx_instance
    try:
        from kokoro_onnx import Kokoro
        model_path, voices_path = _ensure_kokoro_models()
        if model_path and voices_path and os.path.exists(model_path) and os.path.exists(voices_path):
            _kokoro_onnx_instance = Kokoro(model_path, voices_path)
            return _kokoro_onnx_instance
    except Exception as e:
        print(f"Aviso al inicializar kokoro-onnx: {e}")
    return None

def _get_kokoro_pipeline(lang_code: str = 'a'):
    global _kokoro_pipeline
    if _kokoro_pipeline is not None:
        return _kokoro_pipeline
    try:
        from kokoro import KPipeline
        _kokoro_pipeline = KPipeline(lang_code=lang_code)
        return _kokoro_pipeline
    except Exception:
        return None

def generate_kokoro_speech(text: str, voice: str = "af_heart", speed: float = 1.0) -> bytes:
    """Genera audio WAV usando Kokoro TTS (ONNX o PyTorch KPipeline)."""
    clean_voice = voice.lower().replace("kokoro-", "").replace("kokoro:", "").strip()

    # Mapeo de idioma según prefijo de voz
    # 'a' = American English, 'b' = British English, 'e' = Spanish
    lang_code = "a"
    onnx_lang = "en-us"
    if clean_voice.startswith("b"):
        lang_code = "b"
        onnx_lang = "en-gb"
    elif clean_voice.startswith("e"):
        lang_code = "e"
        onnx_lang = "es"
    elif clean_voice.startswith("f"):
        lang_code = "f"
        onnx_lang = "fr"
    elif clean_voice.startswith("i"):
        lang_code = "i"
        onnx_lang = "it"
    elif clean_voice.startswith("j"):
        lang_code = "j"
        onnx_lang = "ja"
    elif clean_voice.startswith("z"):
        lang_code = "z"
        onnx_lang = "zh"

    import soundfile as sf
    import numpy as np

    # 1. Intentar primero con kokoro-onnx (alta eficiencia y compatible con Python 3.13)
    kokoro_onnx = _get_kokoro_onnx()
    if kokoro_onnx:
        samples, sample_rate = kokoro_onnx.create(text, voice=clean_voice, speed=speed, lang=onnx_lang)
        buf = io.BytesIO()
        sf.write(buf, samples, sample_rate, format='WAV')
        return buf.getvalue()

    # 2. Intentar con paquete oficial kokoro (PyTorch KPipeline)
    pipeline = _get_kokoro_pipeline(lang_code=lang_code)
    if pipeline:
        generator = pipeline(text, voice=clean_voice, speed=speed)
        all_audio = []
        for _, _, audio in generator:
            if isinstance(audio, np.ndarray):
                all_audio.append(audio)
            elif hasattr(audio, "numpy"):
                all_audio.append(audio.numpy())
            else:
                all_audio.extend(audio)
        if all_audio:
            if isinstance(all_audio[0], np.ndarray):
                final_samples = np.concatenate(all_audio)
            else:
                final_samples = np.array(all_audio)
            buf = io.BytesIO()
            sf.write(buf, final_samples, 24000, format='WAV')
            return buf.getvalue()

    raise RuntimeError("Kokoro TTS no está disponible. Asegúrate de tener instalado 'kokoro-onnx' o 'kokoro' y 'soundfile'.")



def _parse_time_to_seconds(ts_str: str) -> Optional[float]:
    """Convierte 'MM:SS' o 'HH:MM:SS' a segundos en float."""
    if not ts_str:
        return None
    parts = [p.strip() for p in ts_str.split(":")]
    try:
        if len(parts) == 2:
            return float(int(parts[0]) * 60 + float(parts[1]))
        elif len(parts) == 3:
            return float(int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2]))
    except ValueError:
        return None
    return None


def clean_ocr_noise_line(line: str) -> str:
    """
    Limpia residuos típicos de OCR de controles de reproductor de video
    (ej: 'oo Oo Il G / ye « 7', '0: 3/2340 Dp El mw (7', 'SSSSSsSs...', 'Saltar créditos Pp}').
    Si una línea contiene fragmentos repetidos mezclados con ruido de barra de reproducción,
    conserva la oración limpia más completa.
    """
    if not line:
        return ""

    # Descartar líneas de botón saltar créditos o barras de ruido puro
    if re.search(r'Saltar\s+cr[eé]ditos', line, re.IGNORECASE):
        return ""
    if re.search(r'S{4,}[sS0-9$]+', line):
        return ""

    # Patrón de barra de controles de reproductor capturada por Tesseract OCR
    player_bar_pattern = (
        r'(?:[cCoO0]{1,4}\s*)?'
        r'(?:[-»«•:#]+\s*)?'
        r'(?:Il|IG|WG|I\s*G|G)\s*'
        r'[/\\#&%«»\s]*'
        r'(?:ye|DE|ew|we)?\s*'
        r'[«»&%#Ht\s]*[7\(]*'
    )

    if re.search(r'(?:oo\s*Oo|oO\s*[-»]|Oo\s*WG|oO\s*IG|Oo\s*I\s*G|/\s*ye\s*«|Dp\s*El\s*mw)', line):
        # Si la línea tiene múltiples fragmentos separados por ruido de barra de reproductor,
        # dividir por el patrón de ruido y reconstruir sin duplicados solapados
        chunks = re.split(
            r'(?:(?:CC\s*)?(?:[cCoO0]{1,5}\s*)+[-»«•:#]*\s*(?:Il\s*G|Il|IG|WG|I\s*G|G)?[^a-zA-Z0-9\[\]]*(?:ye|DE|ew|we)?[^a-zA-Z0-9\[\]]*[7\(]*)'
            r'|(?:eo:\s*::\s*«xww[A-Za-z0-9\s:/\(\)]*)',
            line
        )
        cleaned_chunks = []
        for ch in chunks:
            ch = re.sub(r'^\s*[etrf]{1,2}\s+(?:fi\s+)?', '', ch).strip()
            ch = re.sub(r'\btll\b', "I'll", ch)
            ch = ch.strip(' -»«•:/&%#7(')
            if ch and len(re.sub(r'[^a-zA-Z]', '', ch)) >= 3:
                cleaned_chunks.append(ch)

        if not cleaned_chunks:
            return ""

        # Reconstruir eliminando fragmentos que ya están contenidos en fragmentos posteriores más completos
        merged = []
        for i, ch in enumerate(cleaned_chunks):
            is_sub = False
            for later in cleaned_chunks[i + 1:]:
                if ch.lower() in later.lower():
                    is_sub = True
                    break
            if not is_sub:
                # Si el fragmento anterior termina con las mismas palabras con las que empieza este, unirlos
                if merged:
                    prev = merged[-1]
                    # Buscar solapamiento
                    overlap_found = False
                    words_prev = prev.split()
                    words_curr = ch.split()
                    for k in range(min(len(words_prev), len(words_curr)), 1, -1):
                        if [w.lower().strip('.,!?') for w in words_prev[-k:]] == [w.lower().strip('.,!?') for w in words_curr[:k]]:
                            merged[-1] = prev + " " + " ".join(words_curr[k:])
                            overlap_found = True
                            break
                    if not overlap_found:
                        merged.append(ch)
                else:
                    merged.append(ch)
        line = " ".join(merged)

    return line.strip()


def extract_translations_from_bilingual_md(bilingual_content: str) -> Dict[str, str]:
    """
    Extrae un diccionario de traducciones desde un archivo bilingüe (como subtitulos_extraidos.md).
    Mapea tanto por timestamp '[MM:SS]' como por texto en inglés limpio.
    """
    translations: Dict[str, str] = {}
    if not bilingual_content:
        return translations

    current_ts = None
    current_eng = None

    for raw_line in bilingual_content.splitlines():
        line = raw_line.strip()
        if not line or line == "---" or line.startswith("# "):
            continue

        if "💬" in line or line.startswith("###"):
            # Extraer contenido dentro de «...» o después de 💬
            m_quote = re.search(r'«(.+?)»', line)
            eng_part = m_quote.group(1).strip() if m_quote else re.sub(r'^[#\s💬*«]+|[»*]+$', '', line).strip()
            m_ts = re.match(r'^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$', eng_part)
            if m_ts:
                current_ts = m_ts.group(1)
                current_eng = m_ts.group(2).strip()
            else:
                current_ts = None
                current_eng = eng_part
        elif "🇪🇸" in line and (current_ts or current_eng):
            m_quote = re.search(r'«(.+?)»', line)
            esp_part = m_quote.group(1).strip() if m_quote else re.sub(r'^[🇪🇸\s*«]+|[»*]+$', '', line).strip()
            esp_clean = re.sub(r'^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*', '', esp_part).strip()
            esp_clean = re.sub(r'\[[^\]]*\]\s*', '', esp_clean).strip()
            if esp_clean and "[Traducción no disponible" not in esp_clean:
                if current_ts:
                    translations[f"ts:{current_ts}"] = esp_clean
                if current_eng:
                    eng_key = re.sub(r'\[[^\]]*\]\s*', '', current_eng).replace('"', '').strip().lower()
                    if eng_key:
                        translations[f"txt:{eng_key}"] = esp_clean
            current_ts = None
            current_eng = None

    return translations


def parse_subtitle_items(
    content: str,
    remove_bullets: bool = True,
    remove_brackets: bool = True,
    start_marker: Optional[str] = None,
    clean_ocr: bool = True,
    translations_map: Optional[Dict[str, str]] = None
) -> List[Dict]:
    """
    Parsea un documento Markdown o archivo de subtítulos (monolingüe o bilingüe).
    Conserva las marcas de tiempo [MM:SS] como metadatos para sincronizar con audio_extraido.mp3,
    extrae el hablante si existe (ej: [RUDEUS]), limpia el texto para TTS y calcula start_time y end_time.
    """
    if not content:
        return []

    if start_marker and start_marker.strip():
        marker = start_marker.strip()
        idx = content.find(marker)
        if idx != -1:
            content = content[idx + len(marker):]

    # Si el propio contenido es bilingüe (tiene bloques 💬 y 🇪🇸), extraer primero su mapa de traducciones
    inline_translations = extract_translations_from_bilingual_md(content) if "🇪🇸" in content else {}
    merged_translations = {}
    if translations_map:
        merged_translations.update(translations_map)
    merged_translations.update(inline_translations)

    # Eliminar bloques de código ```...```
    content = re.sub(r'```[\s\S]*?```', '', content)
    # Eliminar código en línea `...`
    content = re.sub(r'`[^`]*`', '', content)
    # Convertir enlaces markdown [texto](url) en solo 'texto'
    content = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', content)
    # Eliminar imágenes ![alt](url)
    content = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', '', content)

    raw_items: List[Dict] = []

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line == "---":
            continue

        # Ignorar líneas de traducción en español o encabezados de documento si es un MD bilingüe
        if line.startswith("🇪🇸") or line.startswith("# 🎬"):
            continue

        # Si es una línea de subtítulo bilingüe con ### 💬 **«...»**
        if "💬" in line:
            m_quote = re.search(r'«(.+?)»', line)
            if m_quote:
                line = m_quote.group(1).strip()
            else:
                line = re.sub(r'^[#\s💬*«]+|[»*]+$', '', line).strip()

        # Eliminar marcadores de encabezados # y citas >
        line = re.sub(r'^[#>\s]+', '', line).strip()

        # Opcional: Eliminar numeración de listas (1., 2., 10.) o viñetas (- , * )
        if remove_bullets:
            line = re.sub(r'^(\d+[\.\)]|[-*•+])\s+', '', line).strip()

        # 1. Extraer marca de tiempo inicial [MM:SS] o [HH:MM:SS] antes de limpiar corchetes
        timestamp_str = None
        start_time = None
        m_ts = re.match(r'^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$', line)
        if m_ts:
            timestamp_str = m_ts.group(1)
            start_time = _parse_time_to_seconds(timestamp_str)
            line = m_ts.group(2).strip()

        # 2. Limpiar ruido OCR de barras de reproductor si está habilitado
        if clean_ocr:
            line = clean_ocr_noise_line(line)
            if not line:
                continue

        # 3. Extraer hablante si hay etiqueta en mayúsculas como [RUDEUS], [GHISLAINE], [PHILIP]
        speaker = None
        m_speaker = re.search(r'\[([A-Z][A-Z0-9\s\-]{1,20})\]', line)
        if m_speaker:
            candidate = m_speaker.group(1).strip()
            # Evitar confundir efectos de sonido en minúsculas con hablante
            if candidate.isupper():
                speaker = candidate

        raw_dialogue = line

        # 4. Opcional: Eliminar etiquetas entre corchetes (ej: [RUDEUS], [POLICE 1A], [sighs], [door opens])
        if remove_brackets:
            line = re.sub(r'\[[^\]]*\]\s*[:\-–—]?\s*', '', line).strip()

        # Eliminar caracteres markdown de formato como *, _, ~, «, » y comillas huérfanas al inicio
        line = re.sub(r'[*_~«»]', '', line).strip()
        if line.count('"') == 1:
            line = line.replace('"', '').strip()

        # Limpiar posibles dos puntos o guiones iniciales
        line = re.sub(r'^[:\-–—]\s*', '', line).strip()

        # Corregir espacios antes de signos de puntuación creados al remover corchetes
        line = re.sub(r'\s+([.,;:!?])', r'\1', line).strip()

        # Evitar líneas vacías o de sólo símbolos
        if line and len(re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ]', '', line)) > 0:
            # Buscar traducción si está disponible
            translation = None
            if merged_translations:
                if timestamp_str and f"ts:{timestamp_str}" in merged_translations:
                    translation = merged_translations[f"ts:{timestamp_str}"]
                else:
                    txt_key = line.lower().strip()
                    if f"txt:{txt_key}" in merged_translations:
                        translation = merged_translations[f"txt:{txt_key}"]

            raw_items.append({
                "index": len(raw_items),
                "text": line,
                "raw_text": raw_dialogue,
                "speaker": speaker,
                "timestamp": timestamp_str,
                "start_time": start_time,
                "end_time": None,
                "translation": translation
            })

    # Calcular end_time para cada ítem con start_time basado en el siguiente ítem
    for i, item in enumerate(raw_items):
        if item["start_time"] is not None:
            next_start = None
            for j in range(i + 1, len(raw_items)):
                if raw_items[j]["start_time"] is not None and raw_items[j]["start_time"] > item["start_time"]:
                    next_start = raw_items[j]["start_time"]
                    break
            # Duración estimada natural basada en palabras (aprox 0.35s por palabra, mín 2.2s, máx 10s)
            word_count = max(1, len(item["text"].split()))
            estimated_dur = max(2.2, min(10.0, word_count * 0.38 + 1.0))
            if next_start is not None:
                # Si el siguiente subtítulo está muy lejos (ej. 20s de música), limitar el clip de voz a máx 10s
                gap = next_start - item["start_time"]
                item["end_time"] = round(item["start_time"] + min(gap, max(estimated_dur, min(gap, 9.0))), 2)
            else:
                item["end_time"] = round(item["start_time"] + estimated_dur, 2)

    return raw_items


def clean_markdown_text(
    content: str,
    remove_bullets: bool = True,
    remove_brackets: bool = True,
    start_marker: Optional[str] = None
) -> List[str]:
    """
    Limpia texto en Markdown eliminando bloques de codigo, enlaces, encabezados,
    etiquetas entre corchetes (ej: [POLICE 1A], [00:11]) y caracteres de formato.
    Empieza a procesar el texto directamente después de los corchetes para mayor fluidez.
    """
    items = parse_subtitle_items(
        content=content,
        remove_bullets=remove_bullets,
        remove_brackets=remove_brackets,
        start_marker=start_marker,
        clean_ocr=True
    )
    return [it["text"] for it in items]



async def generate_edge_speech(text: str, voice: str = "en-US-JennyNeural", speed: float = 1.0) -> bytes:
    """Genera audio MP3 usando edge-tts con soporte de velocidad."""
    if not edge_tts:
        raise RuntimeError("edge-tts no está instalado.")
    rate_pct = int(round((speed - 1.0) * 100))
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
    audio_data = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
    if not audio_data:
        raise RuntimeError("No se recibieron datos de audio desde edge-tts.")
    return bytes(audio_data)


def generate_gtts_speech(text: str, lang: str = "en") -> bytes:
    """Genera audio MP3 usando gTTS."""
    if not gTTS:
        raise RuntimeError("gTTS no está instalado.")
    
    # Manejar posibles tlds o códigos de idioma
    language = "en"
    tld = "com"
    if "-" in lang:
        parts = lang.split("-")
        language = parts[0].lower()
        if len(parts) > 1 and parts[1].lower() in ["uk", "co.uk"]:
            tld = "co.uk"
        elif len(parts) > 1 and parts[1].lower() in ["es", "com.mx"]:
            tld = "es" if parts[1].lower() == "es" else "com.mx"
    else:
        language = lang.lower()

    try:
        tts = gTTS(text=text, lang=language, tld=tld, slow=False)
    except Exception:
        tts = gTTS(text=text, lang="en", slow=False)

    buf = io.BytesIO()
    tts.write_to_fp(buf)
    return buf.getvalue()


def generate_windows_sapi_speech(text: str, voice_name: str = "Microsoft Zira Desktop") -> bytes:
    """Genera audio WAV usando el sintetizador nativo de Windows (System.Speech)."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        wav_path = tmp_wav.name
    with tempfile.NamedTemporaryFile(suffix=".ps1", mode="w", encoding="utf-8", delete=False) as tmp_ps1:
        escaped_text = text.replace('"', '`"').replace('$', '`$')
        tmp_ps1.write(f"""
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {{ $s.SelectVoice("{voice_name}") }} catch {{}}
$s.SetOutputToWaveFile("{wav_path}")
$s.Speak("{escaped_text}")
$s.Dispose()
""")
        ps1_path = tmp_ps1.name

    try:
        subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1_path],
            check=True,
            capture_output=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
        with open(wav_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(wav_path):
            try: os.remove(wav_path)
            except Exception: pass
        if os.path.exists(ps1_path):
            try: os.remove(ps1_path)
            except Exception: pass


def get_speech_segment(
    text: str,
    voice: str = "kokoro-af_heart",
    engine: str = "auto",
    speed: float = 1.0
) -> AudioSegment:
    """
    Genera un segmento AudioSegment utilizando el motor especificado
    con respaldo automático (fallback) y control de velocidad (speed).
    """
    raw_audio = None
    audio_format = "mp3"
    errors = []

    clean_voice = voice.lower().replace("kokoro-", "").replace("kokoro:", "").strip()
    is_kokoro_voice = voice.lower().startswith("kokoro") or clean_voice in [
        "af_heart", "af_bella", "af_nicole", "af_sarah", "af_alloy", "af_aoede", "af_jessica", "af_kore", "af_nova", "af_river", "af_sky",
        "am_adam", "am_michael", "am_eric", "am_echo", "am_fenrir", "am_liam", "am_onyx", "am_puck", "am_santa",
        "bf_emma", "bf_isabella", "bf_alice", "bf_lily", "bm_george", "bm_lewis", "bm_daniel", "bm_fable",
        "ef_dora", "em_alex"
    ]

    # 0. Si se eligió Kokoro TTS o la voz es de Kokoro (Máxima prioridad local)
    if engine == "kokoro" or is_kokoro_voice:
        try:
            raw_audio = generate_kokoro_speech(text, voice, speed=speed)
            return AudioSegment.from_file(io.BytesIO(raw_audio), format="wav")
        except Exception as e:
            errors.append(f"Kokoro TTS: {e}")
            if engine == "kokoro":
                raise RuntimeError(f"Fallo en Kokoro TTS: {e}")

    # 1. Si se eligió Windows SAPI
    if engine == "windows-sapi" or voice.startswith("Microsoft "):
        try:
            raw_audio = generate_windows_sapi_speech(text, voice)
            audio_format = "wav"
            return AudioSegment.from_file(io.BytesIO(raw_audio), format="wav")
        except Exception as e:
            errors.append(f"Windows SAPI: {e}")

    # 2. Si se eligió Edge TTS o modo auto
    if engine in ["auto", "edge-tts"] and not raw_audio:
        try:
            raw_audio = asyncio.run(generate_edge_speech(text, voice, speed=speed))
            audio_format = "mp3"
            return AudioSegment.from_file(io.BytesIO(raw_audio), format="mp3", codec="mp3")
        except Exception as e:
            errors.append(f"Edge TTS: {e}")

    # 3. Respaldo a gTTS
    if not raw_audio or engine == "gtts":
        try:
            # Deducir idioma básico de la voz seleccionada
            lang = "en"
            if voice.lower().startswith("es") or "spanish" in voice.lower() or "helena" in voice.lower() or "sabina" in voice.lower() or "laura" in voice.lower():
                lang = "es"
            elif voice.lower().startswith("fr"):
                lang = "fr"
            elif voice.lower().startswith("de"):
                lang = "de"
            elif voice.lower().startswith("it"):
                lang = "it"
            elif voice.lower().startswith("ja"):
                lang = "ja"

            raw_audio = generate_gtts_speech(text, lang=lang)
            audio_format = "mp3"
            return AudioSegment.from_file(io.BytesIO(raw_audio), format="mp3", codec="mp3")
        except Exception as e:
            errors.append(f"gTTS: {e}")

    # 4. Último recurso: Windows SAPI por defecto
    try:
        raw_audio = generate_windows_sapi_speech(text, "Microsoft Zira Desktop")
        return AudioSegment.from_file(io.BytesIO(raw_audio), format="wav")
    except Exception as e:
        errors.append(f"Windows SAPI fallback: {e}")

    raise RuntimeError(f"No fue posible sintetizar el audio. Errores: {'; '.join(errors)}")


def process_pronunciation_to_mp3(
    phrases: List[str],
    repetitions: int = 3,
    silence_rep_ms: int = 1500,
    silence_phrase_ms: int = 2000,
    voice: str = "kokoro-af_heart",
    engine: str = "auto",
    speed: float = 1.0,
    output_path: str = "output_pronunciation.mp3",
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Dict:
    """
    Procesa una lista de frases, repitiendo cada frase N veces con pausas intermedias
    y pausa entre frases distintas, exportando el resultado a un archivo MP3.
    """
    if not phrases:
        raise ValueError("La lista de frases está vacía.")

    combined = AudioSegment.silent(duration=500)
    pause_rep = AudioSegment.silent(duration=max(100, silence_rep_ms))
    pause_phrase = AudioSegment.silent(duration=max(100, silence_phrase_ms))

    total = len(phrases)
    for idx, phrase in enumerate(phrases):
        if progress_callback:
            progress_callback(idx + 1, total, phrase)

        segment = get_speech_segment(phrase, voice=voice, engine=engine, speed=speed)

        for rep in range(repetitions):
            # Durante las repeticiones de la misma frase, usar pause_rep;
            # al terminar la última repetición de la frase, usar pause_phrase
            pause = pause_rep if rep < repetitions - 1 else pause_phrase
            combined += segment + pause

    # Exportar archivo final
    combined.export(output_path, format="mp3")
    total_duration_sec = round(len(combined) / 1000.0, 1)
    file_size_bytes = os.path.getsize(output_path)

    return {
        "status": "success",
        "file_path": output_path,
        "total_phrases": total,
        "repetitions": repetitions,
        "duration_seconds": total_duration_sec,
        "file_size_bytes": file_size_bytes,
        "file_size_formatted": f"{round(file_size_bytes / (1024 * 1024), 2)} MB" if file_size_bytes >= 1024*1024 else f"{round(file_size_bytes / 1024, 1)} KB"
    }


def get_available_voices() -> Dict:
    """Devuelve las listas de voces organizadas por motor e idioma, con prioridad en inglés y marca Kokoro."""
    return {
        "engines": [
            {"id": "auto", "name": "Automático (Recomendado - Mejor disponible)"},
            {"id": "kokoro", "name": "🧠 Kokoro TTS (Local Neural - Alta Calidad)"},
            {"id": "edge-tts", "name": "Microsoft Edge Neural (Alta fidelidad)"},
            {"id": "gtts", "name": "Google TTS (Estable y rápido)"},
            {"id": "windows-sapi", "name": "Windows Nativo (100% Offline)"}
        ],
        "voices": [
            # =========================================================================
            # 🧠 KOKORO TTS - PRIORIDAD MÁXIMA EN INGLÉS (MARCA IDENTIFICADORA [Kokoro])
            # =========================================================================
            # Inglés Americano Femenino (Prioridad 1: af_heart)
            {"id": "kokoro-af_heart", "name": "🧠 [Kokoro] af_heart (Inglés US - Femenino, Recomendada ⭐)", "engine": "kokoro", "lang": "en"},
            {"id": "kokoro-af_bella", "name": "🧠 [Kokoro] af_bella (Inglés US - Femenino)", "engine": "kokoro", "lang": "en"},
            {"id": "kokoro-af_nicole", "name": "🧠 [Kokoro] af_nicole (Inglés US - Femenino)", "engine": "kokoro", "lang": "en"},
            {"id": "kokoro-af_sarah", "name": "🧠 [Kokoro] af_sarah (Inglés US - Femenino)", "engine": "kokoro", "lang": "en"},
            # Inglés Americano Masculino
            {"id": "kokoro-am_adam", "name": "🧠 [Kokoro] am_adam (Inglés US - Masculino)", "engine": "kokoro", "lang": "en"},
            {"id": "kokoro-am_michael", "name": "🧠 [Kokoro] am_michael (Inglés US - Masculino)", "engine": "kokoro", "lang": "en"},
            {"id": "kokoro-am_eric", "name": "🧠 [Kokoro] am_eric (Inglés US - Masculino)", "engine": "kokoro", "lang": "en"},
            # Inglés Británico Femenino
            {"id": "kokoro-bf_emma", "name": "🧠 [Kokoro] bf_emma (Inglés UK - Femenino)", "engine": "kokoro", "lang": "en"},
            {"id": "kokoro-bf_isabella", "name": "🧠 [Kokoro] bf_isabella (Inglés UK - Femenino)", "engine": "kokoro", "lang": "en"},
            # Inglés Británico Masculino
            {"id": "kokoro-bm_george", "name": "🧠 [Kokoro] bm_george (Inglés UK - Masculino)", "engine": "kokoro", "lang": "en"},
            {"id": "kokoro-bm_lewis", "name": "🧠 [Kokoro] bm_lewis (Inglés UK - Masculino)", "engine": "kokoro", "lang": "en"},
            # Kokoro Voces en Español
            {"id": "kokoro-ef_dora", "name": "🧠 [Kokoro] ef_dora (Español - Femenino)", "engine": "kokoro", "lang": "es"},
            {"id": "kokoro-em_alex", "name": "🧠 [Kokoro] em_alex (Español - Masculino)", "engine": "kokoro", "lang": "es"},

            # =========================================================================
            # MICROSOFT EDGE NEURAL
            # =========================================================================
            {"id": "en-US-JennyNeural", "name": "Inglés (EE.UU.) - Jenny (Femenino)", "engine": "edge-tts", "lang": "en"},
            {"id": "en-US-GuyNeural", "name": "Inglés (EE.UU.) - Guy (Masculino)", "engine": "edge-tts", "lang": "en"},
            {"id": "en-US-AriaNeural", "name": "Inglés (EE.UU.) - Aria (Femenino)", "engine": "edge-tts", "lang": "en"},
            {"id": "en-GB-SoniaNeural", "name": "Inglés (Reino Unido) - Sonia (Femenino)", "engine": "edge-tts", "lang": "en"},
            {"id": "en-GB-RyanNeural", "name": "Inglés (Reino Unido) - Ryan (Masculino)", "engine": "edge-tts", "lang": "en"},
            # Español
            {"id": "es-ES-ElviraNeural", "name": "Español (España) - Elvira (Femenino)", "engine": "edge-tts", "lang": "es"},
            {"id": "es-ES-AlvaroNeural", "name": "Español (España) - Álvaro (Masculino)", "engine": "edge-tts", "lang": "es"},
            {"id": "es-MX-DaliaNeural", "name": "Español (México) - Dalia (Femenino)", "engine": "edge-tts", "lang": "es"},
            {"id": "es-MX-JorgeNeural", "name": "Español (México) - Jorge (Masculino)", "engine": "edge-tts", "lang": "es"},

            # =========================================================================
            # GOOGLE TTS
            # =========================================================================
            {"id": "gtts-en", "name": "Google Inglés (US)", "engine": "gtts", "lang": "en"},
            {"id": "gtts-en-uk", "name": "Google Inglés (UK)", "engine": "gtts", "lang": "en"},
            {"id": "gtts-es", "name": "Google Español", "engine": "gtts", "lang": "es"},
            {"id": "gtts-fr", "name": "Google Francés", "engine": "gtts", "lang": "fr"},
            {"id": "gtts-de", "name": "Google Alemán", "engine": "gtts", "lang": "de"},

            # =========================================================================
            # WINDOWS SAPI OFFLINE
            # =========================================================================
            {"id": "Microsoft Zira Desktop", "name": "Windows Zira (Inglés US - Offline)", "engine": "windows-sapi", "lang": "en"},
            {"id": "Microsoft Helena Desktop", "name": "Windows Helena (Español - Offline)", "engine": "windows-sapi", "lang": "es"},
            {"id": "Microsoft Sabina Desktop", "name": "Windows Sabina (Español - Offline)", "engine": "windows-sapi", "lang": "es"}
        ]
    }
