@echo off

node --import tsx --no-warnings=ExperimentalWarning "%~dp0\dev.mjs" %*
