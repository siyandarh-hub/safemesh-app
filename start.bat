@echo off
title SafeMesh server
if not exist "%~dp0.env" node "%~dp0tools\setup.js"
cd /d "%~dp0backend"
if not exist node_modules (
  echo Installing dependencies - first run only...
  call npm install
)
echo Starting SafeMesh on http://localhost:3847 (first start downloads the map/CSS libraries)
call npm start
pause
