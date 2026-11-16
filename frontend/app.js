// State
let wordsData = [];
let currentIndex = 0;
let isPlaying = false;
let timerId = null;
let wpm = 300;
let currentBookId = null;

// DOM Elements
const textInput = document.getElementById('textInput');
const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const wpmSlider = document.getElementById('wpmSlider');
const wpmValue = document.getElementById('wpmValue');
const btnPrepare = document.getElementById('btnPrepare');
const btnReset = document.getElementById('btnReset');
const inputControls = document.getElementById('inputControls');
const contextView = document.getElementById('contextView');

const librarySection = document.getElementById('librarySection');
const libraryGrid = document.getElementById('libraryGrid');

const readerSection = document.getElementById('readerSection');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnStop = document.getElementById('btnStop');
const btnPrev = document.getElementById('btnPrev');
const btnFullscreen = document.getElementById('btnFullscreen');
const iconPlay = document.getElementById('iconPlay');
const iconPause = document.getElementById('iconPause');

const wordLeft = document.getElementById('wordLeft');
const wordPivot = document.getElementById('wordPivot');
const wordRight = document.getElementById('wordRight');

const progressBar = document.getElementById('progressBar');
const sectionDisplay = document.getElementById('sectionDisplay');
const sectionSelector = document.getElementById('sectionSelector');
const wordCountDisplay = document.getElementById('wordCountDisplay');
const timeEstDisplay = document.getElementById('timeEstDisplay');
const toast = document.getElementById('toast');

const API_URL = '';

document.addEventListener('DOMContentLoaded', () => {
    loadLibrary();
});

async function loadLibrary() {
    try {
        const res = await fetch(`${API_URL}/api/history`, {
            headers: { "ngrok-skip-browser-warning": "true" },
            cache: "no-store"
        });
        if (!res.ok) return;
        const history = await res.json();
        
        const keys = Object.keys(history);
        if (keys.length === 0) {
            libraryGrid.innerHTML = '<p class="empty-state">No tienes libros guardados aún.</p>';
            return;
        }
        
        libraryGrid.innerHTML = '';
        keys.forEach(id => {
            const book = history[id];
            const pct = (book.total_words > 0) ? (book.current_index / book.total_words * 100) : 0;
            const date = new Date(book.last_read).toLocaleDateString();
            
            const card = document.createElement('div');
            card.className = 'library-card';
            card.innerHTML = `
                <h3>${book.title}</h3>
                <p>Progreso: ${Math.round(pct)}% (${date})</p>
                <div class="card-progress-container">
                    <div class="card-progress-bar" style="width: ${pct}%"></div>
                </div>
            `;
            card.addEventListener('click', () => loadBookFromLibrary(id));
            libraryGrid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

async function loadBookFromLibrary(bookId) {
    btnPrepare.disabled = true;
    showToast("Cargando libro...");
    
    try {
        const response = await fetch(`${API_URL}/api/load/${bookId}`);
        if (!response.ok) throw new Error("Error cargando el libro");
        
        const data = await response.json();
        wordsData = data.words;
        currentBookId = data.book_id;
        currentIndex = data.current_index;
        
        setupReaderUI();
    } catch (e) {
        showToast("Error conectando con el backend");
    } finally {
        btnPrepare.disabled = false;
    }
}

function saveProgress() {
    if (!currentBookId) return;
    fetch(`${API_URL}/api/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: currentBookId, current_index: currentIndex })
    }).catch(console.error);
}

// Event Listeners
wpmSlider.addEventListener('input', (e) => {
    wpm = parseInt(e.target.value);
    wpmValue.textContent = wpm;
    updateEstimations();
});

sectionSelector.addEventListener('change', (e) => {
    currentIndex = parseInt(e.target.value);
    renderCurrentWord();
    updateEstimations();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        fileNameDisplay.textContent = e.target.files[0].name;
    } else {
        fileNameDisplay.textContent = "Ningún archivo seleccionado";
    }
});

btnReset.addEventListener('click', () => {
    stopPlayback();
    wordsData = [];
    currentBookId = null;
    inputControls.classList.remove('hidden');
    contextView.classList.add('hidden');
    btnPrepare.classList.remove('hidden');
    btnReset.classList.add('hidden');
    readerSection.classList.add('dimmed');
    sectionSelector.classList.add('hidden');
    librarySection.classList.remove('hidden');
    textInput.value = '';
    fileInput.value = '';
    fileNameDisplay.textContent = "Ningún archivo seleccionado";
    
    btnPlayPause.disabled = true;
    btnStop.disabled = true;
    btnPrev.disabled = true;
    
    loadLibrary(); // refresh library
});

btnPrepare.addEventListener('click', async () => {
    const text = textInput.value.trim();
    const file = fileInput.files[0];
    
    if (!text && !file) {
        showToast("Por favor, introduce algún texto o sube un archivo.");
        return;
    }
    
    btnPrepare.disabled = true;
    btnPrepare.textContent = "Procesando...";
    
    try {
        let response;
        let isBookResponse = false;
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            response = await fetch(`${API_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });
            isBookResponse = true;
        } else {
            response = await fetch(`${API_URL}/api/tokenize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });
        }
        
        if (!response.ok) throw new Error("Error en la API");
        
        const data = await response.json();
        
        if (isBookResponse) {
            wordsData = data.words;
            currentBookId = data.book_id;
            currentIndex = data.current_index;
        } else {
            wordsData = data;
            currentBookId = null;
            currentIndex = 0;
        }
        
        setupReaderUI();
        
    } catch (error) {
        console.error(error);
        showToast("Error conectando con el backend. ¿Está corriendo FastAPI?");
    } finally {
        btnPrepare.disabled = false;
        btnPrepare.textContent = "Procesar";
    }
});

function setupReaderUI() {
    if (wordsData.length === 0) {
        showToast("No se encontraron palabras válidas.");
        return;
    }

    const sectionsMap = new Map();
    wordsData.forEach((w, idx) => {
        if (w.page && !sectionsMap.has(w.page)) {
            sectionsMap.set(w.page, idx);
        }
    });
    
    sectionSelector.innerHTML = '';
    if (sectionsMap.size > 0) {
        sectionsMap.forEach((wordIdx, pageName) => {
            const opt = document.createElement('option');
            opt.value = wordIdx;
            opt.textContent = pageName;
            sectionSelector.appendChild(opt);
        });
        sectionSelector.classList.remove('hidden');
    } else {
        sectionSelector.classList.add('hidden');
    }

    stopPlayback(); // Stops and renders current word
    
    readerSection.classList.remove('dimmed');
    btnPlayPause.disabled = false;
    btnStop.disabled = false;
    btnPrev.disabled = false;
    
    inputControls.classList.add('hidden');
    contextView.classList.remove('hidden');
    btnPrepare.classList.add('hidden');
    btnReset.classList.remove('hidden');
    
    librarySection.classList.add('hidden');
    
    renderCurrentWord();
    updateEstimations();
    
    readerSection.scrollIntoView({ behavior: 'smooth' });
}

btnPlayPause.addEventListener('click', () => {
    if (isPlaying) {
        pausePlayback();
    } else {
        startPlayback();
    }
});

btnStop.addEventListener('click', stopPlayback);

btnPrev.addEventListener('click', () => {
    currentIndex = Math.max(0, currentIndex - 10);
    renderCurrentWord();
    updateEstimations();
});

if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            readerSection.requestFullscreen().catch(err => {
                showToast(`Error al intentar pantalla completa: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (wordsData.length === 0) return;
    if (document.activeElement === textInput) return;
    
    if (e.code === 'Space') {
        e.preventDefault();
        btnPlayPause.click();
    } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        btnPrev.click();
    } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        currentIndex = Math.min(wordsData.length - 1, currentIndex + 10);
        renderCurrentWord();
        updateEstimations();
    }
});

// Core RSVP Logic
function startPlayback() {
    if (currentIndex >= wordsData.length) {
        currentIndex = 0;
    }
    
    isPlaying = true;
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
    
    scheduleNextWord();
}

function pausePlayback() {
    isPlaying = false;
    clearTimeout(timerId);
    iconPause.classList.add('hidden');
    iconPlay.classList.remove('hidden');
    saveProgress();
}

function stopPlayback() {
    pausePlayback(); // Will also trigger saveProgress
    renderCurrentWord();
    updateEstimations();
}

function scheduleNextWord() {
    if (!isPlaying) return;
    
    renderCurrentWord();
    updateEstimations();
    
    const currentWord = wordsData[currentIndex];
    
    const baseIntervalMs = 60000 / wpm;
    const delay = baseIntervalMs * currentWord.delay_multiplier;
    
    currentIndex++;
    
    if (currentIndex < wordsData.length) {
        timerId = setTimeout(scheduleNextWord, delay);
    } else {
        isPlaying = false;
        iconPause.classList.add('hidden');
        iconPlay.classList.remove('hidden');
        currentIndex = wordsData.length - 1;
        saveProgress();
    }
}

function renderCurrentWord() {
    if (wordsData.length === 0 || currentIndex >= wordsData.length) return;
    
    const w = wordsData[currentIndex];
    
    wordLeft.textContent = w.left;
    wordPivot.textContent = w.pivot;
    wordRight.textContent = w.right;
    
    if (w.page) {
        sectionDisplay.textContent = w.page;
        sectionDisplay.classList.remove('hidden');
        
        const options = Array.from(sectionSelector.options);
        const matchingOpt = options.find(opt => opt.textContent === w.page);
        if (matchingOpt && sectionSelector.value !== matchingOpt.value) {
            sectionSelector.value = matchingOpt.value;
        }
    } else {
        sectionDisplay.classList.add('hidden');
    }
    
    const startIdx = Math.max(0, currentIndex - 40);
    const endIdx = Math.min(wordsData.length - 1, currentIndex + 40);
    
    let contextHTML = '';
    for (let i = startIdx; i <= endIdx; i++) {
        const w_item = wordsData[i];
        if (i === currentIndex) {
            contextHTML += `<span class="highlight-context">${w_item.word}</span> `;
        } else {
            contextHTML += `${w_item.word} `;
        }
    }
    contextView.innerHTML = contextHTML;
    
    const progress = ((currentIndex + 1) / wordsData.length) * 100;
    progressBar.style.width = `${progress}%`;
}

function updateEstimations() {
    wordCountDisplay.textContent = `${currentIndex + 1} / ${wordsData.length}`;
    
    const remainingWords = wordsData.length - currentIndex;
    const estMinutesRaw = remainingWords / wpm;
    const mins = Math.floor(estMinutesRaw);
    const secs = Math.floor((estMinutesRaw - mins) * 60);
    
    timeEstDisplay.textContent = `${mins}m ${secs}s`;
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Initial State
readerSection.classList.add('dimmed');
