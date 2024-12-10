import { Caip25CaveatValue } from "src/caip25Permission"
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
    added,
    removed,
    unchanged
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
    added[scope] = diffScopeObject.added
    removed[scope] = diffScopeObject.removed
    unchanged[scope] = diffScopeObject.unchanged
  })

  Object.entries(newScopesObject).forEach(([scope, newScopeObject]) => {
    assertIsInternalScopeString(scope)
    const oldScopeObject = oldScopesObject[scope]

    if (!oldScopeObject) {
      added[scope] = newScopeObject
    }
  })

  return {
    added,
    removed,
    unchanged
  }
}
