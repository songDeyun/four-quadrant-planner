@echo off
setlocal
cd /d "%~dp0"
set "PAGE=%~dp0web\index.html"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "?????" "%EDGE%" --app="%PAGE%" --start-maximized
  exit /b 0
)
set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "?????" "%CHROME%" --app="%PAGE%" --start-maximized
  exit /b 0
)
start "" "%PAGE%"
endlocal
