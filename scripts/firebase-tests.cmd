@echo off
call npm.cmd run test:auth:integration
if errorlevel 1 exit /b %errorlevel%
call npm.cmd run test:auth:browser
exit /b %errorlevel%
