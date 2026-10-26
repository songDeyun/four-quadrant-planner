@echo off
setlocal
if exist "%~dp0四象限计划.exe" (
  start "" "%~dp0四象限计划.exe"
  exit /b 0
)
start "" "%~dp0web\index.html"
endlocal
