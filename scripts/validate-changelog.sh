#!/bin/bash

if [[ "$GITHUB_REF" =~ '^release/' ]]; then
  yarn auto-changelog validate --rc
else
  yarn auto-changelog validate
fi
