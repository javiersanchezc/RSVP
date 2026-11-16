@echo off
TITLE Entrenador de Pronunciacion y Shadowing

echo ====================================================
echo    Iniciando Entrenador de Pronunciacion & Shadowing
echo ====================================================
echo.

:: Cambiar al directorio del backend
cd /d "%~dp0backend"

echo 1. Activando entorno e iniciando servidor FastAPI...
start "Servidor RSVP & Pronunciacion" cmd /k "call venv\Scripts\activate.bat && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo 2. Abriendo la aplicacion en tu navegador...
timeout /t 2 /nobreak >nul
start http://localhost:8000/pronunciation

echo.
echo ====================================================
echo  [OK] La aplicacion esta corriendo en:
echo       http://localhost:8000/pronunciation
echo.
echo  Tambien puedes acceder desde tu celular en la misma red Wi-Fi.
echo ====================================================
echo.
echo Ya puedes cerrar esta ventana.
pause >nul
