#!/usr/bin/env bash

if [[ "$GITHUB_REF" =~ '^release/' ]]; then
  auto-changelog validate --rc
else
  auto-changelog validate
fi
