// Pronunciation & Shadowing Trainer Frontend Logic

document.addEventListener("DOMContentLoaded", () => {
    // Referencias al DOM
    const markdownInput = document.getElementById("markdownInput");
    const mdFileInput = document.getElementById("mdFileInput");
    const mdFileNameDisplay = document.getElementById("mdFileNameDisplay");
    const chkCleanBullets = document.getElementById("chkCleanBullets");
    const chkCleanBrackets = document.getElementById("chkCleanBrackets");
    const startMarkerInput = document.getElementById("startMarkerInput");
    const btnParseText = document.getElementById("btnParseText");

    // Presets
    const btnPresetPolice = document.getElementById("btnPresetPolice");
    const btnPresetEnglish = document.getElementById("btnPresetEnglish");
    const btnPresetPhrasal = document.getElementById("btnPresetPhrasal");
    const btnPresetSpanish = document.getElementById("btnPresetSpanish");

    // Configuración
    const voiceSelect = document.getElementById("voiceSelect");
    const btnTestVoice = document.getElementById("btnTestVoice");
    const repetitionsSlider = document.getElementById("repetitionsSlider");
    const repetitionsValue = document.getElementById("repetitionsValue");
    const silenceRepSlider = document.getElementById("silenceRepSlider");
    const silenceRepValue = document.getElementById("silenceRepValue");
    const silencePhraseSlider = document.getElementById("silencePhraseSlider");
    const silencePhraseValue = document.getElementById("silencePhraseValue");
    const speedConfigSlider = document.getElementById("speedConfigSlider");
    const speedConfigValue = document.getElementById("speedConfigValue");

    // Frases
    const phrasesList = document.getElementById("phrasesList");
    const phraseCountBadge = document.getElementById("phraseCountBadge");
    const btnClearPhrases = document.getElementById("btnClearPhrases");
    const btnAddPhraseModalBtn = document.getElementById("btnAddPhraseModalBtn");

    // Historial y Sesiones
    const historySection = document.getElementById("historySection");
    const historyGrid = document.getElementById("historyGrid");
    const historyCountBadge = document.getElementById("historyCountBadge");
    const btnRefreshHistory = document.getElementById("btnRefreshHistory");
    const btnToggleHistory = document.getElementById("btnToggleHistory");
    const historySyncIndicator = document.getElementById("historySyncIndicator");
    const sessionResumeTag = document.getElementById("sessionResumeTag");
    const resumePhraseNum = document.getElementById("resumePhraseNum");

    // Tabs
    const tabLivePractice = document.getElementById("tabLivePractice");
    const tabExportMp3 = document.getElementById("tabExportMp3");
    const paneLivePractice = document.getElementById("paneLivePractice");
    const paneExportMp3 = document.getElementById("paneExportMp3");

    // Reproductor Shadowing
    const playerStatusBadge = document.getElementById("playerStatusBadge");
    const activePhraseIndex = document.getElementById("activePhraseIndex");
    const activePhraseText = document.getElementById("activePhraseText");
    const repDotsContainer = document.getElementById("repDotsContainer");

    const countdownBar = document.getElementById("countdownBar");
    const countdownText = document.getElementById("countdownText");
    const btnPrevPhrase = document.getElementById("btnPrevPhrase");
    const btnTogglePlay = document.getElementById("btnTogglePlay");
    const btnReplayPhrase = document.getElementById("btnReplayPhrase");
    const btnNextPhrase = document.getElementById("btnNextPhrase");
    const btnSpeedSelector = document.getElementById("btnSpeedSelector");
    const playerSpeedBadge = document.getElementById("playerSpeedBadge");
    const speedMenuModal = document.getElementById("speedMenuModal");
    const playIcon = document.getElementById("playIcon");
    const pauseIcon = document.getElementById("pauseIcon");
    const playButtonText = document.getElementById("playButtonText");

    // Modo Maximizado y Escala de Texto
    const shadowingPlayer = document.getElementById("shadowingPlayer");
    const btnMaximizePlayer = document.getElementById("btnMaximizePlayer");
    const btnCloseMaximized = document.getElementById("btnCloseMaximized");
    const maximizeIcon = document.getElementById("maximizeIcon");
    const minimizeIcon = document.getElementById("minimizeIcon");
    const btnTextSmaller = document.getElementById("btnTextSmaller");
    const btnTextReset = document.getElementById("btnTextReset");
    const btnTextLarger = document.getElementById("btnTextLarger");
    const btnToggleListHeight = document.getElementById("btnToggleListHeight");

    // Generación MP3
    const btnGenerateMp3 = document.getElementById("btnGenerateMp3");
    const generationProgressBox = document.getElementById("generationProgressBox");
    const genProgressStatus = document.getElementById("genProgressStatus");
    const genProgressPercent = document.getElementById("genProgressPercent");
    const genProgressBarFill = document.getElementById("genProgressBarFill");
    const genCurrentPhrase = document.getElementById("genCurrentPhrase");
    const generationResultBox = document.getElementById("generationResultBox");
    const resultMetaInfo = document.getElementById("resultMetaInfo");
    const finalAudioPlayer = document.getElementById("finalAudioPlayer");
    const btnDownloadMp3 = document.getElementById("btnDownloadMp3");

    // Audio auxiliar para pruebas
    const previewAudioElement = document.getElementById("previewAudioElement");

    // Estado de la aplicación
    let phrases = [];
    let isPlaying = false;
    let currentPhraseIdx = 0;
    let currentRepetition = 0;
    let shadowingTimeoutId = null;
    let countdownIntervalId = null;
    let currentAudioObj = null;
    let activeSessionId = null;
    let syncTimeout = null;

    // Velocidad de reproducción (Estilo YouTube)
    const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    let currentSpeed = parseFloat(localStorage.getItem("pronunciationPlaybackSpeed") || "1.0");

    // Helper fetch con bypass de advertencia de ngrok y prevención de caché en móviles
    async function apiFetch(url, options = {}) {
        const defaultHeaders = {
            "ngrok-skip-browser-warning": "true"
        };
        const headers = Object.assign(defaultHeaders, options.headers || {});
        return fetch(url, {
            ...options,
            headers: headers,
            cache: "no-store"
        });
    }

    // --- PRESETS DE EJEMPLO ---
    const PRESETS = {
        police: `# Diálogo Radio [POLICE 1A]
[POLICE 1A] Dispatch, Unit 1A is on scene at 4th and Main.
[DISPATCH]: Copy that Unit 1A, all units proceed with caution.
[POLICE 1A] - Suspect vehicle is heading northbound on foot.
[DISPATCH] All available backup units are en route [10-4].
[POLICE 1A] Suspect has been detained, situation is under control.`,

        english: `# Everyday Conversations
1. **Good morning!** How are you doing today?
2. I am doing very well, *thank you for asking*.
3. What are your plans for the upcoming weekend?
4. Could you please repeat that a little more slowly?
5. Consistent daily practice is the true key to fluency.`,

        phrasal: `# Essential Phrasal Verbs
1. **Bring up**. Don't hesitate to bring up new ideas in the meeting.
2. **Figure out**. We will work hard and figure out the best solution.
3. **Call off**. They had to call off the trip due to bad weather.
4. **Look forward to**. I truly look forward to seeing your progress.
5. **Get along with**. It is very important to get along with your team.`,

        spanish: `# Ejercicios de Fluidez y Pronunciación
1. Tres tristes tigres tragaban trigo en un trigal.
2. El cielo está encapotado, ¿quién lo desencapotará?
3. Rápido corren los carros por los rieles del ferrocarril.
4. La práctica constante y pausada fortalece la dicción y la confianza.`
    };

    // Eventos de presets
    if (btnPresetPolice) btnPresetPolice.addEventListener("click", () => loadPreset(PRESETS.police));
    btnPresetEnglish.addEventListener("click", () => loadPreset(PRESETS.english));
    btnPresetPhrasal.addEventListener("click", () => loadPreset(PRESETS.phrasal));
    btnPresetSpanish.addEventListener("click", () => loadPreset(PRESETS.spanish));

    function loadPreset(text) {
        markdownInput.value = text;
        processInputText();
    }

    // --- CARGA DE ARCHIVOS ---
    mdFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        mdFileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (event) => {
            markdownInput.value = event.target.result;
            processInputText();
        };
        reader.readAsText(file, "UTF-8");
    });

    // --- CONTROL DE SLIDERS ---
    repetitionsSlider.addEventListener("input", (e) => {
        repetitionsValue.textContent = `${e.target.value}x`;
        updateRepDots();
    });

    silenceRepSlider.addEventListener("input", (e) => {
        const sec = (parseInt(e.target.value) / 1000).toFixed(1);
        silenceRepValue.textContent = `${sec} seg`;
    });

    silencePhraseSlider.addEventListener("input", (e) => {
        const sec = (parseInt(e.target.value) / 1000).toFixed(1);
        silencePhraseValue.textContent = `${sec} seg`;
    });

    // --- GESTIÓN DE VELOCIDAD DE REPRODUCCIÓN (YOUTUBE-STYLE) ---
    function setPlaybackSpeed(newSpeed, updateSlider = true) {
        let speed = parseFloat(newSpeed);
        if (isNaN(speed) || speed < 0.25 || speed > 3.0) speed = 1.0;
        currentSpeed = speed;
        localStorage.setItem("pronunciationPlaybackSpeed", currentSpeed.toString());

        // Actualizar dinámicamente el audio en caliente si está sonando (sin pausas ni saltos)
        if (currentAudioObj) {
            try {
                currentAudioObj.playbackRate = currentSpeed;
                currentAudioObj.preservesPitch = true;
            } catch (err) {
                console.warn("No se pudo actualizar playbackRate en caliente:", err);
            }
        }

        // Actualizar badge en los controles del reproductor
        if (playerSpeedBadge) {
            playerSpeedBadge.textContent = `${currentSpeed}x`;
        }

        // Actualizar slider y valor en panel de configuración
        if (speedConfigValue) {
            speedConfigValue.textContent = currentSpeed === 1.0 ? "1.0x (Normal)" : `${currentSpeed}x`;
        }
        if (updateSlider && speedConfigSlider) {
            speedConfigSlider.value = currentSpeed;
        }

        // Sincronizar clases y marcas de verificación en el popover
        const speedItems = document.querySelectorAll(".speed-item");
        speedItems.forEach((btn) => {
            const btnSpeed = parseFloat(btn.getAttribute("data-speed"));
            const isMatch = Math.abs(btnSpeed - currentSpeed) < 0.01;
            btn.classList.toggle("active", isMatch);
            const checkSpan = btn.querySelector(".check-mark");
            if (isMatch) {
                if (!checkSpan) {
                    const span = document.createElement("span");
                    span.className = "check-mark";
                    span.textContent = "✓";
                    btn.appendChild(span);
                }
            } else if (checkSpan) {
                checkSpan.remove();
            }
        });
    }

    function changeSpeedPreset(step) {
        let currentIdx = SPEED_PRESETS.findIndex(s => Math.abs(s - currentSpeed) < 0.05);
        if (currentIdx === -1) {
            currentIdx = SPEED_PRESETS.reduce((closest, s, idx) => 
                Math.abs(s - currentSpeed) < Math.abs(SPEED_PRESETS[closest] - currentSpeed) ? idx : closest, 0);
        }
        const nextIdx = Math.min(SPEED_PRESETS.length - 1, Math.max(0, currentIdx + step));
        setPlaybackSpeed(SPEED_PRESETS[nextIdx]);
        showSyncToast(`Velocidad: ${SPEED_PRESETS[nextIdx]}x`);
    }

    if (speedConfigSlider) {
        speedConfigSlider.addEventListener("input", (e) => {
            setPlaybackSpeed(e.target.value, false);
        });
    }

    if (btnSpeedSelector && speedMenuModal) {
        btnSpeedSelector.addEventListener("click", (e) => {
            e.stopPropagation();
            speedMenuModal.classList.toggle("hidden");
        });

        document.addEventListener("click", (e) => {
            if (!speedMenuModal.classList.contains("hidden") &&
                !speedMenuModal.contains(e.target) &&
                e.target !== btnSpeedSelector &&
                !btnSpeedSelector.contains(e.target)) {
                speedMenuModal.classList.add("hidden");
            }
        });
    }

    document.querySelectorAll(".speed-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const spd = btn.getAttribute("data-speed");
            if (spd) setPlaybackSpeed(spd);
            if (speedMenuModal) speedMenuModal.classList.add("hidden");
        });
    });

    // --- TABS DE MODO ---
    tabLivePractice.addEventListener("click", () => {
        tabLivePractice.classList.add("active");
        tabExportMp3.classList.remove("active");
        paneLivePractice.classList.add("active");
        paneExportMp3.classList.remove("active");
    });

    tabExportMp3.addEventListener("click", () => {
        tabExportMp3.classList.add("active");
        tabLivePractice.classList.remove("active");
        paneExportMp3.classList.add("active");
        paneLivePractice.classList.remove("active");
        stopLivePractice();
    });

    // --- PROCESAMIENTO DE TEXTO ---
    btnParseText.addEventListener("click", processInputText);

    async function processInputText() {
        const text = markdownInput.value.trim();
        if (!text) {
            alert("Por favor introduce texto o sube un archivo Markdown.");
            return;
        }

        btnParseText.disabled = true;
        btnParseText.innerHTML = "Procesando...";

        const removeBullets = chkCleanBullets ? chkCleanBullets.checked : true;
        const removeBrackets = chkCleanBrackets ? chkCleanBrackets.checked : true;
        const startMarker = startMarkerInput ? startMarkerInput.value.trim() : "";

        try {
            const resp = await apiFetch("/api/pronunciation/parse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: text,
                    remove_bullets: removeBullets,
                    remove_brackets: removeBrackets,
                    start_marker: startMarker
                })
            });

            if (!resp.ok) throw new Error("Error en el servidor al parsear");
            const data = await resp.json();
            phrases = data.phrases;
            renderPhrasesList();
            initPlayerWithPhrases();
            await saveCurrentSession(true);
        } catch (err) {
            console.warn("Fallo endpoint backend, usando parser local de respaldo:", err);
            phrases = localMarkdownParser(text, removeBullets, removeBrackets, startMarker);
            renderPhrasesList();
            initPlayerWithPhrases();
            await saveCurrentSession(true);
        } finally {

            btnParseText.disabled = false;
            btnParseText.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Procesar Frases
            `;
        }
    }

    // Parser local de respaldo (por si no hay conexión al backend en algún momento)
    function localMarkdownParser(raw, removeBullets, removeBrackets = true, startMarker = "") {
        if (startMarker && startMarker.trim()) {
            const marker = startMarker.trim();
            const idx = raw.indexOf(marker);
            if (idx !== -1) {
                raw = raw.substring(idx + marker.length);
            }
        }

        let clean = raw.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
        clean = clean.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1").replace(/!\[([^\]]*)\]\([^\)]+\)/g, "");

        const lines = [];
        clean.split(/\r?\n/).forEach(line => {
            let l = line.trim().replace(/^[#>\s]+/, "");
            if (removeBullets) {
                l = l.replace(/^(\d+[\.\)]|[-*•+])\s+/, "");
            }
            if (removeBrackets) {
                l = l.replace(/\[[^\]]*\]\s*[:\-–—]?\s*/g, "").trim();
            }
            l = l.replace(/[*_~]/g, "").trim();
            l = l.replace(/^[:\-–—]\s*/, "").trim();
            l = l.replace(/\s+([.,;:!?])/g, "$1").trim();
            if (l.length > 1 && /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ]/.test(l)) {
                lines.push(l);
            }
        });
        return lines;
    }


    // Renderizar tarjetas de frases editables
    function renderPhrasesList() {
        phraseCountBadge.textContent = `${phrases.length} frases`;
        if (phrases.length === 0) {
            phrasesList.innerHTML = `<p class="empty-phrases-notice">No se detectaron frases válidas en el texto.</p>`;
            return;
        }

        phrasesList.innerHTML = "";
        phrases.forEach((phrase, idx) => {
            const item = document.createElement("div");
            item.className = "phrase-item";
            item.id = `phrase-item-${idx}`;

            item.innerHTML = `
                <span class="phrase-num">${idx + 1}</span>
                <input type="text" class="phrase-text-editable" value="${escapeHtml(phrase)}" data-idx="${idx}" />
                <div class="phrase-item-actions">
                    <button class="item-action-btn play-single-btn" data-idx="${idx}" title="Escuchar esta frase">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>
                    <button class="item-action-btn delete-btn" data-idx="${idx}" title="Eliminar frase">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            phrasesList.appendChild(item);
        });

        // Listeners para inputs y botones de frase
        document.querySelectorAll(".phrase-text-editable").forEach(input => {
            input.addEventListener("input", (e) => {
                const i = parseInt(e.target.dataset.idx);
                phrases[i] = e.target.value;
                if (currentPhraseIdx === i) {
                    activePhraseText.textContent = phrases[i];
                }
            });
        });

        document.querySelectorAll(".play-single-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const i = parseInt(btn.dataset.idx);
                playSinglePhraseAudio(phrases[i]);
            });
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const i = parseInt(btn.dataset.idx);
                phrases.splice(i, 1);
                renderPhrasesList();
                initPlayerWithPhrases();
            });
        });
    }

    btnClearPhrases.addEventListener("click", () => {
        if (confirm("¿Deseas vaciar la lista de frases?")) {
            phrases = [];
            renderPhrasesList();
            initPlayerWithPhrases();
        }
    });

    btnAddPhraseModalBtn.addEventListener("click", () => {
        const newText = prompt("Escribe la nueva frase a practicar:");
        if (newText && newText.trim()) {
            phrases.push(newText.trim());
            renderPhrasesList();
            initPlayerWithPhrases();
            // Scroll hacia la última frase
            phrasesList.scrollTop = phrasesList.scrollHeight;
        }
    });

    // --- REPRODUCTOR SHADOWING EN VIVO ---
    function initPlayerWithPhrases() {
        stopLivePractice();
        currentPhraseIdx = 0;
        currentRepetition = 0;
        if (phrases.length > 0) {
            activePhraseIndex.textContent = `Frase 1 de ${phrases.length}`;
            activePhraseText.textContent = phrases[0];
            playerStatusBadge.textContent = "Listo para comenzar";
            playerStatusBadge.className = "player-status-badge";
        } else {
            activePhraseIndex.textContent = "Sin frases";
            activePhraseText.textContent = "Carga o escribe frases arriba para comenzar.";
            playerStatusBadge.textContent = "En espera";
            playerStatusBadge.className = "player-status-badge";
        }
        updateRepDots();
        highlightActiveListItem();
    }

    function updateRepDots() {
        const reps = parseInt(repetitionsSlider.value);
        repDotsContainer.innerHTML = "";
        for (let i = 0; i < reps; i++) {
            const dot = document.createElement("div");
            dot.className = "rep-dot";
            if (i < currentRepetition) {
                dot.classList.add("completed");
            } else if (i === currentRepetition && isPlaying) {
                dot.classList.add("active");
            }
            repDotsContainer.appendChild(dot);
        }
    }

    function highlightActiveListItem() {
        document.querySelectorAll(".phrase-item").forEach((el, idx) => {
            if (idx === currentPhraseIdx && isPlaying) {
                el.classList.add("active-playing");
                el.scrollIntoView({ behavior: "smooth", block: "nearest" });
            } else {
                el.classList.remove("active-playing");
            }
        });
    }

    btnTogglePlay.addEventListener("click", toggleLivePractice);

    function toggleLivePractice() {
        if (phrases.length === 0) {
            alert("No hay frases para practicar. Agrega o procesa frases primero.");
            return;
        }

        if (isPlaying) {
            pauseLivePractice();
        } else {
            startLivePractice();
        }
    }

    function startLivePractice() {
        isPlaying = true;
        playIcon.classList.add("hidden");
        pauseIcon.classList.remove("hidden");
        playButtonText.textContent = "Pausar";
        stepPracticeLoop();
    }

    function pauseLivePractice() {
        isPlaying = false;
        playIcon.classList.remove("hidden");
        pauseIcon.classList.add("hidden");
        playButtonText.textContent = "Continuar";
        playerStatusBadge.textContent = "Pausado";
        playerStatusBadge.className = "player-status-badge";
        clearTimeout(shadowingTimeoutId);
        clearInterval(countdownIntervalId);
        if (currentAudioObj) {
            currentAudioObj.pause();
        }
        window.speechSynthesis.cancel();
        updateRepDots();
        highlightActiveListItem();
        syncProgress(currentPhraseIdx, currentRepetition);
    }

    function stopLivePractice() {
        pauseLivePractice();
        playButtonText.textContent = "Iniciar Práctica";
        currentRepetition = 0;
        countdownBar.style.width = "0%";
        countdownText.textContent = "";
        updateRepDots();
    }

    // Bucle principal de ejecución del shadowing
    async function stepPracticeLoop() {
        if (!isPlaying || phrases.length === 0) return;

        if (currentPhraseIdx >= phrases.length) {
            // Completado todo el texto
            playerStatusBadge.textContent = "🎉 ¡Lección completada!";
            playerStatusBadge.className = "player-status-badge shadowing";
            activePhraseText.textContent = "¡Excelente trabajo! Has completado todas las repeticiones.";
            syncProgress(phrases.length, 0);
            stopLivePractice();
            return;
        }

        const totalReps = parseInt(repetitionsSlider.value);
        const phrase = phrases[currentPhraseIdx];

        activePhraseIndex.textContent = `Frase ${currentPhraseIdx + 1} de ${phrases.length}`;
        activePhraseText.textContent = phrase;
        highlightActiveListItem();
        updateRepDots();

        // 1. Fase de Escucha (TTS habla)
        playerStatusBadge.textContent = `🔊 Repetición ${currentRepetition + 1} de ${totalReps}: Escucha`;
        playerStatusBadge.className = "player-status-badge listening";
        countdownBar.style.width = "0%";
        countdownText.textContent = "";

        try {
            await playSpeechPromise(phrase);
        } catch (e) {
            console.error("Error reproduciendo audio:", e);
        }

        if (!isPlaying) return;

        // 2. Fase de Shadowing (Silencio para que el usuario repita)
        const isLastRep = (currentRepetition + 1) >= totalReps;
        const silenceDuration = isLastRep 
            ? parseInt(silencePhraseSlider.value) 
            : parseInt(silenceRepSlider.value);

        playerStatusBadge.textContent = isLastRep
            ? `🎤 ¡Repite ahora! Próxima frase en ${(silenceDuration/1000).toFixed(1)}s`
            : `🎤 ¡Tu turno! Repite ahora en voz alta`;
        playerStatusBadge.className = "player-status-badge shadowing";

        await runCountdownPromise(silenceDuration);

        if (!isPlaying) return;

        // Avanzar repetición o frase
        if (isLastRep) {
            currentRepetition = 0;
            currentPhraseIdx++;
            syncProgress(currentPhraseIdx, 0);
        } else {
            currentRepetition++;
            syncProgress(currentPhraseIdx, currentRepetition);
        }

        updateRepDots();
        stepPracticeLoop();
    }


    // Promesa de síntesis de voz (Usa API /preview o Web Speech API nativo del navegador)
    function playSpeechPromise(text) {
        return new Promise(async (resolve) => {
            const voice = voiceSelect.value;

            // Intentar primero a través del backend (/api/pronunciation/preview)
            try {
                const resp = await apiFetch("/api/pronunciation/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: text, voice: voice, engine: "auto", speed: currentSpeed })
                });

                if (resp.ok) {
                    const blob = await resp.blob();
                    const audioUrl = URL.createObjectURL(blob);
                    currentAudioObj = new Audio(audioUrl);
                    currentAudioObj.playbackRate = currentSpeed;
                    currentAudioObj.preservesPitch = true;
                    currentAudioObj.onended = () => {
                        URL.revokeObjectURL(audioUrl);
                        resolve();
                    };
                    currentAudioObj.onerror = () => {
                        playNativeWebSpeech(text, voice, resolve);
                    };
                    currentAudioObj.play().catch(() => {
                        playNativeWebSpeech(text, voice, resolve);
                    });
                    return;
                }
            } catch (err) {
                console.warn("Backend preview falló, usando Web Speech API nativo:", err);
            }

            // Respaldo instantáneo con Web Speech API
            playNativeWebSpeech(text, voice, resolve);
        });
    }

    function playNativeWebSpeech(text, voiceHint, onEndCallback) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Detectar idioma aproximado
        if (voiceHint.toLowerCase().includes("es") || voiceHint.toLowerCase().includes("elvira") || voiceHint.toLowerCase().includes("helena")) {
            utterance.lang = "es-ES";
        } else {
            utterance.lang = "en-US";
        }
        utterance.rate = Math.min(2.0, Math.max(0.5, currentSpeed));

        utterance.onend = () => onEndCallback();
        utterance.onerror = () => onEndCallback();
        window.speechSynthesis.speak(utterance);
    }

    // Promesa de cuenta regresiva visual
    function runCountdownPromise(durationMs) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const interval = 50;

            countdownIntervalId = setInterval(() => {
                if (!isPlaying) {
                    clearInterval(countdownIntervalId);
                    resolve();
                    return;
                }

                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, durationMs - elapsed);
                const percent = Math.min(100, (elapsed / durationMs) * 100);

                countdownBar.style.width = `${percent}%`;
                countdownText.textContent = `${(remaining / 1000).toFixed(1)}s`;

                if (elapsed >= durationMs) {
                    clearInterval(countdownIntervalId);
                    countdownBar.style.width = "100%";
                    countdownText.textContent = "";
                    resolve();
                }
            }, interval);
        });
    }

    function updatePlayerDisplay() {
        if (phrases.length > 0) {
            activePhraseIndex.textContent = `Frase ${currentPhraseIdx + 1} de ${phrases.length}`;
            activePhraseText.textContent = phrases[currentPhraseIdx];
            updateRepDots();
            highlightActiveListItem();
        }
    }

    // Botones de navegación del reproductor
    btnPrevPhrase.addEventListener("click", () => {
        if (currentPhraseIdx > 0) {
            currentPhraseIdx--;
            currentRepetition = 0;
            if (isPlaying) {
                clearTimeout(shadowingTimeoutId);
                clearInterval(countdownIntervalId);
                stepPracticeLoop();
            } else {
                updatePlayerDisplay();
            }
            syncProgress(currentPhraseIdx, 0);
        }
    });

    btnNextPhrase.addEventListener("click", () => {
        if (currentPhraseIdx < phrases.length - 1) {
            currentPhraseIdx++;
            currentRepetition = 0;
            if (isPlaying) {
                clearTimeout(shadowingTimeoutId);
                clearInterval(countdownIntervalId);
                stepPracticeLoop();
            } else {
                updatePlayerDisplay();
            }
            syncProgress(currentPhraseIdx, 0);
        }
    });

    btnReplayPhrase.addEventListener("click", () => {
        currentRepetition = 0;
        if (isPlaying) {
            clearTimeout(shadowingTimeoutId);
            clearInterval(countdownIntervalId);
            stepPracticeLoop();
        } else {
            updatePlayerDisplay();
            startLivePractice();
        }
        syncProgress(currentPhraseIdx, 0);
    });


    // Atajos de teclado
    document.addEventListener("keydown", (e) => {
        // Ignorar si está escribiendo en el textarea o un input editable
        if (["TEXTAREA", "INPUT"].includes(e.target.tagName)) return;

        if (e.code === "Space") {
            e.preventDefault();
            toggleLivePractice();
        } else if (e.code === "ArrowLeft") {
            e.preventDefault();
            btnPrevPhrase.click();
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            btnNextPhrase.click();
        } else if (e.code === "KeyR") {
            e.preventDefault();
            btnReplayPhrase.click();
        } else if (e.code === "KeyF") {
            e.preventDefault();
            toggleMaximizePlayer();
        } else if (e.code === "Escape") {
            if (isPlayerMaximized()) {
                e.preventDefault();
                toggleMaximizePlayer(false);
            }
        } else if (e.shiftKey && (e.key === ">" || e.code === "Period")) {
            e.preventDefault();
            changeSpeedPreset(1);
        } else if (e.shiftKey && (e.key === "<" || e.code === "Comma")) {
            e.preventDefault();
            changeSpeedPreset(-1);
        }
    });

    // Gestión de tamaño y escala de texto
    let phraseScale = parseFloat(localStorage.getItem("phraseTextScale") || "1.0");

    function applyPhraseScale(scale) {
        phraseScale = Math.min(2.0, Math.max(0.7, scale));
        document.documentElement.style.setProperty("--phrase-scale", phraseScale.toFixed(2));
        localStorage.setItem("phraseTextScale", phraseScale.toFixed(2));
        if (btnTextReset) {
            btnTextReset.textContent = `${Math.round(phraseScale * 100)}%`;
        }
    }
    applyPhraseScale(phraseScale);

    if (btnTextSmaller) {
        btnTextSmaller.addEventListener("click", () => applyPhraseScale(phraseScale - 0.15));
    }
    if (btnTextReset) {
        btnTextReset.addEventListener("click", () => applyPhraseScale(1.0));
    }
    if (btnTextLarger) {
        btnTextLarger.addEventListener("click", () => applyPhraseScale(phraseScale + 0.15));
    }

    // Maximizar / Restaurar Modo Enfoque (Shadowing Player)
    let playerPlaceholder = null;

    function isPlayerMaximized() {
        return shadowingPlayer && shadowingPlayer.classList.contains("is-maximized");
    }

    function toggleMaximizePlayer(forceState) {
        if (!shadowingPlayer) return;
        const isCurrentlyMax = shadowingPlayer.classList.contains("is-maximized");
        const shouldMaximize = typeof forceState === "boolean" 
            ? forceState 
            : !isCurrentlyMax;

        if (shouldMaximize === isCurrentlyMax) return;

        if (shouldMaximize) {
            // Guardar marcador de posición para reinsertarlo en el lugar exacto del panel
            if (!playerPlaceholder) {
                playerPlaceholder = document.createElement("div");
                playerPlaceholder.id = "shadowingPlayerPlaceholder";
                playerPlaceholder.style.display = "none";
            }
            if (shadowingPlayer.parentNode) {
                shadowingPlayer.parentNode.insertBefore(playerPlaceholder, shadowingPlayer);
            }
            // Mover directamente a document.body para liberarlo de cualquier backdrop-filter o contenedor padre
            document.body.appendChild(shadowingPlayer);

            shadowingPlayer.classList.add("is-maximized");
            document.body.classList.add("player-maximized-open");
            if (maximizeIcon) maximizeIcon.classList.add("hidden");
            if (minimizeIcon) minimizeIcon.classList.remove("hidden");
            if (btnCloseMaximized) btnCloseMaximized.classList.remove("hidden");
            if (btnMaximizePlayer) btnMaximizePlayer.title = "Restaurar tamaño (Esc o F)";
        } else {
            shadowingPlayer.classList.remove("is-maximized");
            document.body.classList.remove("player-maximized-open");

            // Devolver al panel original
            if (playerPlaceholder && playerPlaceholder.parentNode) {
                playerPlaceholder.parentNode.insertBefore(shadowingPlayer, playerPlaceholder);
                playerPlaceholder.remove();
                playerPlaceholder = null;
            }

            if (maximizeIcon) maximizeIcon.classList.remove("hidden");
            if (minimizeIcon) minimizeIcon.classList.add("hidden");
            if (btnCloseMaximized) btnCloseMaximized.classList.add("hidden");
            if (btnMaximizePlayer) btnMaximizePlayer.title = "Maximizar / Pantalla Completa (F)";
        }
    }

    if (btnMaximizePlayer) {
        btnMaximizePlayer.addEventListener("click", () => toggleMaximizePlayer());
    }
    if (btnCloseMaximized) {
        btnCloseMaximized.addEventListener("click", () => toggleMaximizePlayer(false));
    }

    // Toggle expandir / compactar altura de lista de frases
    if (btnToggleListHeight && phrasesList) {
        btnToggleListHeight.addEventListener("click", () => {
            const isExpanded = phrasesList.classList.toggle("is-expanded");
            btnToggleListHeight.textContent = isExpanded ? "↕️ Compactar Lista" : "↕️ Expandir Lista";
        });
    }

    // Muestra de voz instantánea
    btnTestVoice.addEventListener("click", async () => {
        const voice = voiceSelect.value;
        const isSpanish = voice.toLowerCase().includes("es") || voice.toLowerCase().includes("ef_dora") || voice.toLowerCase().includes("em_alex") || voice.toLowerCase().includes("helena") || voice.toLowerCase().includes("sabina");
        const testText = isSpanish 
            ? "Hola, esta es una muestra de voz para tu práctica de pronunciación." 
            : "Hello, this is a sample of this voice for your pronunciation practice.";
        
        btnTestVoice.disabled = true;
        try {
            await playSpeechPromise(testText);
        } finally {
            btnTestVoice.disabled = false;
        }
    });

    function playSinglePhraseAudio(text) {
        playSpeechPromise(text);
    }

    // --- MODO 2: GENERACIÓN Y EXPORTACIÓN MP3 ---
    btnGenerateMp3.addEventListener("click", async () => {
        if (phrases.length === 0) {
            alert("No hay frases para procesar. Agrega frases primero.");
            return;
        }

        stopLivePractice();

        btnGenerateMp3.disabled = true;
        generationProgressBox.classList.remove("hidden");
        generationResultBox.classList.add("hidden");
        genProgressBarFill.style.width = "0%";
        genProgressPercent.textContent = "0%";
        genProgressStatus.textContent = "Iniciando compilación de audio...";
        genCurrentPhrase.textContent = "";

        const payload = {
            phrases: phrases,
            repetitions: parseInt(repetitionsSlider.value),
            silence_rep_ms: parseInt(silenceRepSlider.value),
            silence_phrase_ms: parseInt(silencePhraseSlider.value),
            voice: voiceSelect.value,
            engine: "auto",
            speed: currentSpeed
        };

        try {
            const resp = await apiFetch("/api/pronunciation/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errData = await resp.json();
                throw new Error(errData.detail || "Error al iniciar generación.");
            }

            const { job_id } = await resp.json();
            pollGenerationStatus(job_id);
        } catch (err) {
            alert(`Error: ${err.message}`);
            btnGenerateMp3.disabled = false;
            generationProgressBox.classList.add("hidden");
        }
    });

    function pollGenerationStatus(jobId) {
        const interval = setInterval(async () => {
            try {
                const resp = await apiFetch(`/api/pronunciation/status/${jobId}`);
                if (!resp.ok) throw new Error("No se pudo consultar el estado.");
                const data = await resp.json();

                if (data.status === "processing") {
                    genProgressBarFill.style.width = `${data.percent}%`;
                    genProgressPercent.textContent = `${data.percent}%`;
                    genProgressStatus.textContent = `Procesando frase ${data.current} de ${data.total}...`;
                    genCurrentPhrase.textContent = data.current_phrase ? `"${data.current_phrase}"` : "";
                } else if (data.status === "completed") {
                    clearInterval(interval);
                    genProgressBarFill.style.width = "100%";
                    genProgressPercent.textContent = "100%";
                    genProgressStatus.textContent = "¡Compilación completa!";
                    
                    showGenerationSuccess(jobId, data.result);
                    btnGenerateMp3.disabled = false;
                } else if (data.status === "failed") {
                    clearInterval(interval);
                    alert(`Error en la generación: ${data.error}`);
                    btnGenerateMp3.disabled = false;
                    generationProgressBox.classList.add("hidden");
                }
            } catch (err) {
                clearInterval(interval);
                alert(`Error al consultar progreso: ${err.message}`);
                btnGenerateMp3.disabled = false;
            }
        }, 800);
    }

    function showGenerationSuccess(jobId, result) {
        generationProgressBox.classList.add("hidden");
        generationResultBox.classList.remove("hidden");

        resultMetaInfo.innerHTML = `
            <span><strong>Frases:</strong> ${result.total_phrases}</span> • 
            <span><strong>Repeticiones:</strong> ${result.repetitions}x</span> • 
            <span><strong>Duración:</strong> ${result.duration_seconds} seg</span> • 
            <span><strong>Tamaño:</strong> ${result.file_size_formatted}</span>
        `;

        const downloadUrl = `/api/pronunciation/download/${jobId}`;
        finalAudioPlayer.src = downloadUrl;
        btnDownloadMp3.href = downloadUrl;
    }

    // Función auxiliar para escapar texto en HTML
    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // --- GESTIÓN DE HISTORIAL Y REANUDACIÓN DE SESIONES ---

    function formatRelativeTime(isoStr) {
        if (!isoStr) return "";
        try {
            const date = new Date(isoStr);
            const now = new Date();
            const diffSec = Math.floor((now - date) / 1000);
            if (diffSec < 60) return "Hace un momento";
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return `Hace ${diffMin} min`;
            const diffHours = Math.floor(diffMin / 60);
            if (diffHours < 24) return `Hace ${diffHours} h`;
            return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    }

    function showSyncToast(text = "Guardado") {
        if (!historySyncIndicator) return;
        const syncText = document.getElementById("syncText");
        if (syncText) syncText.textContent = text;
        historySyncIndicator.classList.remove("hidden");
        clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            historySyncIndicator.classList.add("hidden");
        }, 2200);
    }

    async function loadHistory() {
        if (!historyGrid) return;
        try {
            const resp = await apiFetch("/api/pronunciation/history");
            if (!resp.ok) {
                console.error("Error cargando historial de pronunciación, HTTP Status:", resp.status);
                return;
            }
            const data = await resp.json();
            const sessions = data.sessions || [];
            
            if (historyCountBadge) {
                historyCountBadge.textContent = `${sessions.length} guardadas`;
            }

            if (sessions.length === 0) {
                historyGrid.innerHTML = `<p class="empty-history-notice">Aún no tienes lecciones en el historial. Tu progreso se guardará automáticamente mientras escuchas para que puedas retomar en cualquier momento.</p>`;
                return;
            }

            historyGrid.innerHTML = "";
            sessions.forEach(sess => {
                const card = document.createElement("div");
                card.className = "history-card";
                card.id = `history-card-${sess.session_id}`;

                const phrasePreview = sess.current_phrase || (sess.phrases && sess.phrases[sess.current_phrase_idx || 0]) || "Sin frase";
                const totalNum = sess.total_phrases || (sess.phrases ? sess.phrases.length : 1);
                const currentNum = Math.min((sess.current_phrase_idx || 0) + 1, totalNum);
                const pct = sess.percent_completed || 0;
                const timeAgo = formatRelativeTime(sess.last_practiced);
                const voiceName = sess.voice ? (sess.voice.split("-").pop() || sess.voice) : "Voz";

                card.innerHTML = `
                    <div class="history-card-header">
                        <h3 class="history-card-title">${escapeHtml(sess.title || "Lección")}</h3>
                        <span class="history-card-date">${timeAgo}</span>
                    </div>
                    <div class="history-card-phrase">
                        <span class="history-phrase-label">Última frase escuchada:</span>
                        <p class="history-phrase-text">"${escapeHtml(phrasePreview)}"</p>
                    </div>
                    <div class="history-progress-wrap">
                        <div class="history-progress-info">
                            <span>Frase ${currentNum} de ${totalNum}</span>
                            <span>${pct}%</span>
                        </div>
                        <div class="history-progress-bar">
                            <div class="history-progress-fill" style="width: ${pct}%"></div>
                        </div>
                    </div>
                    <div class="history-card-footer">
                        <span class="history-meta-pill">${escapeHtml(voiceName)} • ${sess.repetitions || 3}x</span>
                        <div class="history-card-actions">
                            <button class="btn primary resume-btn" data-id="${sess.session_id}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                Retomar
                            </button>
                            <button class="btn icon-btn delete-history-btn" data-id="${sess.session_id}" title="Eliminar lección">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                `;
                historyGrid.appendChild(card);
            });

            // Conectar eventos a los botones de cada tarjeta
            document.querySelectorAll(".resume-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    resumeSession(btn.dataset.id);
                });
            });

            document.querySelectorAll(".delete-history-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    deleteSession(btn.dataset.id);
                });
            });

        } catch (err) {
            console.warn("Error al cargar historial:", err);
        }
    }

    async function saveCurrentSession(isInitial = false) {
        if (!phrases || phrases.length === 0) return;
        try {
            const resp = await apiFetch("/api/pronunciation/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: isInitial ? null : activeSessionId,
                    raw_text: markdownInput.value,
                    phrases: phrases,
                    current_phrase_idx: currentPhraseIdx,
                    current_repetition: currentRepetition,
                    voice: voiceSelect.value,
                    repetitions: parseInt(repetitionsSlider.value),
                    silence_rep_ms: parseInt(silenceRepSlider.value),
                    silence_phrase_ms: parseInt(silencePhraseSlider.value),
                    remove_brackets: chkCleanBrackets ? chkCleanBrackets.checked : true,
                    remove_bullets: chkCleanBullets ? chkCleanBullets.checked : true
                })
            });
            if (resp.ok) {
                const data = await resp.json();
                activeSessionId = data.session_id;
                showSyncToast("Lección guardada");
                loadHistory();
            }
        } catch (e) {
            console.warn("Error guardando sesión en historial:", e);
        }
    }

    async function syncProgress(phraseIdx, repIdx = 0) {
        if (!activeSessionId) return;
        try {
            await apiFetch("/api/pronunciation/history/progress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: activeSessionId,
                    current_phrase_idx: phraseIdx,
                    current_repetition: repIdx
                })
            });
            showSyncToast("Progreso guardado");
            loadHistory();
        } catch (e) {
            console.warn("Error sincronizando progreso:", e);
        }
    }

    async function resumeSession(sessionId) {
        try {
            const resp = await apiFetch(`/api/pronunciation/history/${sessionId}`);
            if (!resp.ok) throw new Error("No se pudo obtener la sesión.");
            const session = await resp.json();

            activeSessionId = session.session_id;

            // Restaurar texto y opciones
            markdownInput.value = session.raw_text || "";
            if (session.voice) voiceSelect.value = session.voice;
            if (session.repetitions) {
                repetitionsSlider.value = session.repetitions;
                repetitionsValue.textContent = `${session.repetitions}x`;
            }
            if (session.silence_rep_ms) {
                silenceRepSlider.value = session.silence_rep_ms;
                silenceRepValue.textContent = `${(session.silence_rep_ms/1000).toFixed(1)} seg`;
            }
            if (session.silence_phrase_ms) {
                silencePhraseSlider.value = session.silence_phrase_ms;
                silencePhraseValue.textContent = `${(session.silence_phrase_ms/1000).toFixed(1)} seg`;
            }
            if (typeof session.remove_brackets !== "undefined" && chkCleanBrackets) {
                chkCleanBrackets.checked = session.remove_brackets;
            }
            if (typeof session.remove_bullets !== "undefined" && chkCleanBullets) {
                chkCleanBullets.checked = session.remove_bullets;
            }

            // Restaurar lista de frases y progreso
            phrases = session.phrases || [];
            currentPhraseIdx = Math.max(0, Math.min(session.current_phrase_idx || 0, phrases.length - 1));
            currentRepetition = session.current_repetition || 0;

            renderPhrasesList();

            // Actualizar tarjeta activa en el reproductor Shadowing
            if (phrases.length > 0) {
                activePhraseIndex.textContent = `Frase ${currentPhraseIdx + 1} de ${phrases.length}`;
                activePhraseText.textContent = phrases[currentPhraseIdx];
                if (sessionResumeTag) {
                    sessionResumeTag.classList.remove("hidden");
                }
                if (resumePhraseNum) {
                    resumePhraseNum.textContent = `${currentPhraseIdx + 1} de ${phrases.length}`;
                }
                playerStatusBadge.textContent = "📍 Lección retomada - Listo para continuar";
                playerStatusBadge.className = "player-status-badge listening";
            }

            updateRepDots();
            highlightActiveListItem();

            // Cambiar a la pestaña de práctica en vivo
            if (tabLivePractice) tabLivePractice.click();

            // Scroll suave al reproductor
            const execControls = document.getElementById("executionControls");
            if (execControls) {
                execControls.scrollIntoView({ behavior: "smooth", block: "start" });
            }

            showSyncToast(`Retomando frase ${currentPhraseIdx + 1}`);
        } catch (err) {
            alert("Error al retomar lección: " + err.message);
        }
    }

    async function deleteSession(sessionId) {
        if (!confirm("¿Deseas eliminar esta lección del historial?")) return;
        try {
            const resp = await apiFetch(`/api/pronunciation/history/${sessionId}`, { method: "DELETE" });
            if (resp.ok) {
                if (activeSessionId === sessionId) {
                    activeSessionId = null;
                }
                loadHistory();
            }
        } catch (err) {
            console.error("Error al eliminar sesión:", err);
        }
    }

    // Botones de control del historial
    if (btnRefreshHistory) {
        btnRefreshHistory.addEventListener("click", () => {
            loadHistory();
            showSyncToast("Historial actualizado");
        });
    }

    if (btnToggleHistory) {
        btnToggleHistory.addEventListener("click", () => {
            if (historyGrid.classList.contains("hidden")) {
                historyGrid.classList.remove("hidden");
                btnToggleHistory.textContent = "Ocultar";
            } else {
                historyGrid.classList.add("hidden");
                btnToggleHistory.textContent = "Mostrar";
            }
        });
    }

    // Inicialización al cargar la página: cargar historial y preparar plantilla sin autoguardar duplicados
    async function initApp() {
        setPlaybackSpeed(currentSpeed);
        await loadHistory();
        if (!markdownInput.value.trim()) {
            markdownInput.value = PRESETS.english;
            const removeBullets = chkCleanBullets ? chkCleanBullets.checked : true;
            const removeBrackets = chkCleanBrackets ? chkCleanBrackets.checked : true;
            phrases = localMarkdownParser(PRESETS.english, removeBullets, removeBrackets, "");
            renderPhrasesList();
            initPlayerWithPhrases();
        }
    }

    initApp();
});

