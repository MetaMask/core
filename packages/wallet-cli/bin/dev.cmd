@echo off

node --loader tsx --no-warnings=ExperimentalWarning "%~dp0\dev" %*
