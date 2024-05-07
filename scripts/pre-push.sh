#!/bin/bash

# If the push refs start with (delete), then we're deleting a branch, so skip the pre-push hook
# Source: <https://github.com/typicode/husky/issues/169#issuecomment-1719263454>
stdin="$(cat -)"
if echo "$stdin" | grep -q "^(delete)"; then
  exit 0
fi

exec yarn lint:only-branch
