@echo off
REM ─────────────────────────────────────────────────────────────
REM  EasyMindMap 로컬 실행 — Windows 명령 프롬프트(cmd)용 래퍼.
REM  cmd 에서 그냥  dev  또는  dev.cmd  를 치면 dev.ps1 을 올바로 실행한다.
REM  (cmd 는 .ps1 을 직접 실행하지 못하고 "앱 선택"을 띄우므로 이 래퍼가 필요)
REM ─────────────────────────────────────────────────────────────
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
