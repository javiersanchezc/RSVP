from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import re
import fitz  # PyMuPDF
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
import os
import json
import uuid
import shutil
from datetime import datetime

app = FastAPI(title="RSVP Speed Reading API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for MVP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LIBRARY_DIR = "library"
HISTORY_FILE = "history.json"

# Ensure directories exist
if not os.path.exists(LIBRARY_DIR):
    os.makedirs(LIBRARY_DIR)
if not os.path.exists(HISTORY_FILE):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump({}, f)

def load_history() -> dict:
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def save_history(history: dict):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=4)

class TokenizeRequest(BaseModel):
    text: str

class WordData(BaseModel):
    word: str
    orp_index: int
    left: str
    pivot: str
    right: str
    delay_multiplier: float
    page: Optional[str] = None

class BookResponse(BaseModel):
    book_id: str
    current_index: int
    words: List[WordData]

class ProgressRequest(BaseModel):
    book_id: str
    current_index: int

def calculate_orp(word_clean: str) -> int:
    length = len(word_clean)
    if length <= 2:
        return 0 if length == 1 else 1
    elif 3 <= length <= 5:
        return 1
    elif 6 <= length <= 9:
        return 2
    else:
        return 3

def get_delay_multiplier(word: str) -> float:
    if word.endswith(('.', '?', '!')):
        return 1.8
    elif word.endswith((',', ';')):
        return 1.3
    return 1.0

def process_text(text: str, page: str = None) -> List[WordData]:
    clean_text = re.sub(r'\s+', ' ', text).strip()
    if not clean_text:
        return []

    words = clean_text.split(' ')
    result = []
    for w in words:
        if not w:
            continue
            
        w_clean = w.rstrip('.,;!?()"\'')
        w_clean = w_clean.lstrip('()"\'')
        if not w_clean:
            w_clean = w
            
        orp_index = calculate_orp(w_clean)
        left_puncts = len(w) - len(w.lstrip('()"\''))
        actual_orp_index = min(orp_index + left_puncts, len(w) - 1)

        delay_multi = get_delay_multiplier(w)
        left_part = w[:actual_orp_index]
        pivot_char = w[actual_orp_index]
        right_part = w[actual_orp_index+1:]
        
        result.append(WordData(
            word=w,
            orp_index=actual_orp_index,
            left=left_part,
            pivot=pivot_char,
            right=right_part,
            delay_multiplier=delay_multi,
            page=page
        ))
        
    return result

@app.post("/api/tokenize", response_model=List[WordData])
async def tokenize_text(request: TokenizeRequest):
    return process_text(request.text)

def extract_text_from_epub(file_path: str) -> List[WordData]:
    all_words = []
    book = epub.read_epub(file_path)
    chapter_idx = 1
    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            soup = BeautifulSoup(item.get_body_content(), 'html.parser')
            text = soup.get_text(separator=' ', strip=True)
            if text:
                chapter_words = process_text(text, page=f"Capítulo {chapter_idx}")
                if chapter_words:
                    all_words.extend(chapter_words)
                    chapter_idx += 1
    return all_words

def extract_text_from_pdf(file_path: str) -> List[WordData]:
    doc = fitz.open(file_path)
    all_words = []
    for page_num, page in enumerate(doc):
        text = page.get_text()
        if text:
            page_words = process_text(text, page=f"Página {page_num + 1}")
            all_words.extend(page_words)
    return all_words

@app.post("/api/upload", response_model=BookResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    ext = file.filename.lower().split('.')[-1]
    if ext not in ['pdf', 'epub']:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    book_id = str(uuid.uuid4())
    safe_filename = f"{book_id}.{ext}"
    file_path = os.path.join(LIBRARY_DIR, safe_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    if ext == 'pdf':
        words = extract_text_from_pdf(file_path)
    elif ext == 'epub':
        words = extract_text_from_epub(file_path)
        
    history = load_history()
    history[book_id] = {
        "title": file.filename,
        "filename": safe_filename,
        "current_index": 0,
        "total_words": len(words),
        "last_read": datetime.now().isoformat()
    }
    save_history(history)
    
    return BookResponse(book_id=book_id, current_index=0, words=words)

@app.get("/api/history")
def get_history():
    return load_history()

@app.post("/api/progress")
def update_progress(req: ProgressRequest):
    history = load_history()
    if req.book_id in history:
        history[req.book_id]["current_index"] = req.current_index
        history[req.book_id]["last_read"] = datetime.now().isoformat()
        save_history(history)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Book not found")

@app.get("/api/load/{book_id}", response_model=BookResponse)
def load_book(book_id: str):
    history = load_history()
    if book_id not in history:
        raise HTTPException(status_code=404, detail="Book not found")
        
    book_info = history[book_id]
    file_path = os.path.join(LIBRARY_DIR, book_info["filename"])
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing in library")
        
    ext = book_info["filename"].split('.')[-1]
    if ext == 'pdf':
        words = extract_text_from_pdf(file_path)
    elif ext == 'epub':
        words = extract_text_from_epub(file_path)
        
    return BookResponse(
        book_id=book_id,
        current_index=book_info.get("current_index", 0),
        words=words
    )

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.endswith((".js", ".css", ".html")) or request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

from fastapi.responses import FileResponse
from pronunciation_router import router as pronunciation_router

app.include_router(pronunciation_router)

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
}

@app.get("/")
def read_root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"), headers=NO_CACHE_HEADERS)

@app.get("/pronunciation")
def read_pronunciation():
    return FileResponse(os.path.join(FRONTEND_DIR, "pronunciation.html"), headers=NO_CACHE_HEADERS)

app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")


