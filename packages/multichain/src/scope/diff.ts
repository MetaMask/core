import { assertIsInternalScopeString } from "./assert"
import { InternalScopeObject, InternalScopesObject } from "./types"

const diffInternalScopeObject = (oldScopeObject: InternalScopeObject, newScopeObject: InternalScopeObject) => {
  const added: InternalScopeObject = {
    accounts: newScopeObject.accounts.filter(account => !oldScopeObject.accounts.includes(account))
  }
  const removed: InternalScopeObject = {
    accounts: oldScopeObject.accounts.filter(account => !newScopeObject.accounts.includes(account))
  }
  const unchanged: InternalScopeObject = {
    accounts: oldScopeObject.accounts.filter(account => newScopeObject.accounts.includes(account))
  }

  return {
    added: added.accounts.length ? added : null,
    removed: removed.accounts.length ? removed: null,
    unchanged: unchanged.accounts.length ? unchanged: null,
  }
}

export const diffInternalScopesObject = (oldScopesObject: InternalScopesObject, newScopesObject: InternalScopesObject) => {
  const added: InternalScopesObject = {
  }
  const removed: InternalScopesObject = {
  }
  const unchanged: InternalScopesObject = {
  }

  Object.entries(oldScopesObject).forEach(([scope, oldScopeObject]) => {
    assertIsInternalScopeString(scope)
    const newScopeObject = newScopesObject[scope] ?? {
      accounts: []
    }

    const diffScopeObject = diffInternalScopeObject(oldScopeObject, newScopeObject)
    if (diffScopeObject.added) {
      added[scope] = diffScopeObject.added
    }
    if (diffScopeObject.removed) {
      removed[scope] = diffScopeObject.removed
    }
    if (diffScopeObject.unchanged) {
      unchanged[scope] = diffScopeObject.unchanged
    }
  })

  Object.entries(newScopesObject).forEach(([scope, newScopeObject]) => {
    assertIsInternalScopeString(scope)
    if (!oldScopesObject[scope]) {
      added[scope] = newScopeObject
    }
  })

  return {
    added,
    removed,
    unchanged
  }
}
