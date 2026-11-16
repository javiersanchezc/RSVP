@echo off
TITLE RSVP Speed Reading App

echo =========================================
echo      Iniciando RSVP Speed Reading
echo =========================================
echo.

:: Cambiar al directorio del backend (basado en la ubicacion de este script)
cd /d "%~dp0backend"

echo 1. Activando entorno e iniciando servidor (FastAPI)...
:: Inicia el servidor en una nueva ventana de comandos
start "Servidor RSVP (Backend)" cmd /k "call venv\Scripts\activate.bat && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo [OK] El servidor esta cargando en: http://localhost:8000
echo (Puedes entrar desde tu celular conectado al mismo Wi-Fi usando la IP de tu PC)
echo.

set /p RESP="¿Deseas generar un enlace publico de Internet usando Ngrok? (S/N): "
if /i "%RESP%"=="S" (
    echo.
    echo Iniciando Ngrok en el puerto 8000...
    :: Inicia ngrok en una nueva ventana
    start "Ngrok Tunnel" cmd /k "ngrok http 8000"
    echo.
    echo [OK] Ngrok se ha abierto en una nueva ventana. 
    echo Copia el enlace que aparece alli (ej: https://...ngrok-free.dev)
) else (
    echo.
    echo Entendido. Puedes seguir usando la aplicacion de forma local.
)

echo.
echo Ya puedes cerrar esta ventana.
pause >nul
