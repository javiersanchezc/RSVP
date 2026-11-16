"""
Script CLI para generar audios de pronunciación y repetición a partir de Markdown.
Usa pronunciation_service con soporte para Kokoro TTS local (🧠 af_heart), Edge TTS, Google TTS y Windows SAPI.
"""

import sys
import os
import argparse

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Asegurar importación del backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from pronunciation_service import (
    clean_markdown_text,
    process_pronunciation_to_mp3,
    get_available_voices
)

def process_markdown(
    file_path: str,
    repetitions: int = 3,
    silence_ms: int = 1500,
    voice: str = "kokoro-af_heart",
    output_file: str = "output_pronunciation.mp3",
    remove_brackets: bool = True,
    start_marker: str = None
):
    if not os.path.exists(file_path):
        print(f"Error: El archivo '{file_path}' no existe.")
        return

    print(f"📖 Leyendo lección desde: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    phrases = clean_markdown_text(
        content,
        remove_bullets=True,
        remove_brackets=remove_brackets,
        start_marker=start_marker
    )
    if not phrases:
        print("No se encontraron frases de texto válidas en el archivo.")
        return

    print(f"✨ Se detectaron {len(phrases)} frases para procesar.")
    if remove_brackets:
        print("🔇 Filtro de corchetes activo: Se procesa directamente después de etiquetas como [POLICE 1A] para mayor fluidez.")
    if start_marker:
        print(f"📍 Marcador de inicio: Procesando a partir de '{start_marker}'")
    print(f"⚙️ Configuración: {repetitions} repeticiones por frase | Pausa: {silence_ms}ms | Voz: {voice}")

    def on_progress(current, total, phrase):
        print(f"[{current}/{total}] Procesando: \"{phrase}\"")

    try:
        result = process_pronunciation_to_mp3(
            phrases=phrases,
            repetitions=repetitions,
            silence_rep_ms=silence_ms,
            silence_phrase_ms=silence_ms + 500,
            voice=voice,
            engine="auto",
            output_path=output_file,
            progress_callback=on_progress
        )
        print("\n" + "="*50)
        print(f"🎉 ¡Archivo generado con éxito!: {result['file_path']}")
        print(f"⏱️ Duración total: {result['duration_seconds']} segundos")
        print(f"💾 Tamaño: {result['file_size_formatted']}")
        print("="*50)
    except Exception as e:
        print(f"Error durante el procesamiento: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generador de Audio para Práctica de Pronunciación (Shadowing)")
    parser.add_argument("file", nargs="?", default="leccion.md", help="Ruta al archivo Markdown (.md)")
    parser.add_argument("-r", "--repetitions", type=int, default=3, help="Número de repeticiones por frase (defecto: 3)")
    parser.add_argument("-s", "--silence", type=int, default=1500, help="Milisegundos de pausa entre repeticiones (defecto: 1500)")
    parser.add_argument("-v", "--voice", type=str, default="kokoro-af_heart", help="Voz TTS (defecto: kokoro-af_heart [Kokoro 🧠]. Opciones: af_heart, af_bella, am_adam, bf_emma, en-US-JennyNeural, etc.)")
    parser.add_argument("-o", "--output", type=str, default="output_pronunciation.mp3", help="Nombre del archivo de salida")
    parser.add_argument("--keep-brackets", action="store_true", help="Mantener etiquetas entre corchetes (por defecto se omiten)")
    parser.add_argument("--start-marker", type=str, default=None, help="Comenzar a procesar solo después de un marcador específico (ej: '[POLICE 1A]')")

    args = parser.parse_args()
    process_markdown(
        file_path=args.file,
        repetitions=args.repetitions,
        silence_ms=args.silence,
        voice=args.voice,
        output_file=args.output,
        remove_brackets=not args.keep_brackets,
        start_marker=args.start_marker
    )



