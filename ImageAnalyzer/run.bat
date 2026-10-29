@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" goto missing
"%PYTHON_EXE%" -c "import sys" >nul 2>&1
if errorlevel 1 goto missing
"%PYTHON_EXE%" -m streamlit run "%~dp0app.py" --server.address=127.0.0.1 %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" pause
exit /b %RESULT%
:missing
echo No se encuentra un entorno Python funcional. Sigue la instalacion del README.md.
pause
exit /b 1
