/**
 * Yarn 4 plugin for script environment hardening.
 *
 * @module
 */

/** @typedef {NonNullable<import('@yarnpkg/core').Hooks['wrapScriptExecution']>} WrapScriptExecutionHook */

/* global makeRunScriptWrapper */

/**
 * Yarn 4 plugin factory for wrapScriptExecution hook.
 *
 * @param {any} require - Yarn's require function
 * @returns {{ hooks: { wrapScriptExecution: Function } }}
 */
module.exports = {
  name: '@yarnpkg/plugin-runner',
  factory: function (/** @type {NodeJS.Require} */ require) {
    const { tmpdir } = require('node:os')
    return {
      hooks: {
        /** @type {WrapScriptExecutionHook} */
        wrapScriptExecution: async (
          executor,
          project,
          locator,
          scriptName,
          extra
        ) => {
          const path = require('node:path')
          const fs = require('node:fs')
          const workspace = project.tryWorkspaceByLocator(locator)

          if (!workspace) {
            // a script is being executed outside of a workspace context, so we
            // can't apply any custom logic.
            // This is the case when a postinstal is running.

            // "Do nothing" - return the original executor immediately
            // without running any custom plugin logic or reading manifests.
            // TODO: implement wrapping these scripts with reasonable defaults
            return executor
          }

          const pkgJson = workspace.manifest.raw
          const binFolder =
            extra.env.BERRY_BIN_FOLDER || `node_modules${path.sep}.bin`

          const wrapper = makeRunScriptWrapper(
            {
              scriptName,
              scriptPayload: extra.script,
              projectRoot: extra.cwd,
              pathBinMatcher: (fragment) => {
                return fragment.endsWith(binFolder)
              },
              customizePermissionsConfig: addMandatoryReads,
              readScriptsConfig: () => {
                return pkgJson.scriptsConfig
              },
            },
            {
              readFileSync: fs.readFileSync,
              pathJoin: path.join,
              pathDelimiter: path.delimiter,
              tmpdir,
              realpathSync: fs.realpathSync,
            }
          )

          // extra.env is a reference to the mutable object, but a different variable
          // containing that reference is used within execute, so we must amend not
          // replace it.
          const newEnv = wrapper.processEnv(extra.env)
          for (const key of Object.keys(extra.env)) {
            delete extra.env[key]
          }
          Object.assign(extra.env, newEnv)
          return executor
        },
      },
    }
  },
}

/**
 * @param {Record<string, boolean | string | string[]>} configOptions
 * @param {NodeJS.ProcessEnv} _env
 */
function addMandatoryReads(configOptions, _env) {
  if (!configOptions['--permission']) {
    return
  }
  configOptions['--allow-fs-tmp'] = true // yarn always uses tmp dirs.
}

;;
/// <reference path="./makeRunScriptWrapper.global.d.ts" />

/**
 * @param {MakeRunScriptWrapperOptions} param0
 * @param {MakeRunScriptWrapperIO} param1
 * @returns {MakeRunScriptWrapper}
 */
function makeRunScriptWrapper(
  {
    scriptName,
    scriptPayload: _scriptPayload, // might be useful to read in the future
    projectRoot,
    pathBinMatcher,
    customizePermissionsConfig,
    readScriptsConfig,
  },
  { readFileSync, pathJoin, pathDelimiter, tmpdir, realpathSync }
) {
  const DEFAULT_PERMISSION_KEY = '#default'

  /** @param {string} filePath */
  function readJsonFile(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  }

  /**
   * @param {object} opts
   * @param {Record<string, string> | undefined} opts.scriptsConfig
   * @param {string} [opts.scriptName]
   * @param {string} opts.projectRoot
   */
  function readConfig({
    scriptsConfig,
    scriptName = DEFAULT_PERMISSION_KEY,
    projectRoot,
  }) {
    if (!scriptsConfig) {
      return {}
    }
    const configName =
      scriptsConfig[scriptName] || scriptsConfig[DEFAULT_PERMISSION_KEY]

    // config needs to be optional, because it's opt-in first and specifying a default turns it opt-out.
    if (!configName) {
      return {}
    }
    const configPath = pathJoin(projectRoot, configName)
    let conf
    try {
      conf = readJsonFile(configPath)
      if (typeof conf !== 'object' || conf === null) {
        throw Error(`Expected an object, got ${typeof conf}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw Error(
        `[LavaMoat] Error loading script config file "${configPath}": ${message}`,
        { cause: err }
      )
    }
    return conf
  }

  /**
   * Adds features we'd want in Node.js permissions model and intend to
   * eventually upstream
   *
   * @param {ConfigOptions} configOptions
   * @param {NodeJS.ProcessEnv} env
   * @returns {void}
   */
  function permissionsModelCompatibilityExtensions(configOptions, env) {
    // 1. support env variables as values in allow-fs-*
    /**
     * @param {string} value
     * @returns {string}
     */
    const replaceEnvVar = (value) => {
      const envVarMatch = value.match(/^\$([A-Z_][A-Z0-9_]*)$/i)
      if (envVarMatch) {
        const envVarName = envVarMatch[1]
        if (env[envVarName] !== undefined) {
          return env[envVarName]
        } else {
          console.error(
            `[LavaMoat] Environment variable "${envVarName}" referenced in config but not found in environment`
          )
        }
      }
      return value
    }

    for (const key of ['--allow-fs-read', '--allow-fs-write']) {
      if (Array.isArray(configOptions[key])) {
        configOptions[key] = configOptions[key].map(replaceEnvVar)
      }
    }

    // 2. tmp write - crossplatform
    if (configOptions['--allow-fs-tmp'] === true) {
      delete configOptions['--allow-fs-tmp']
      if (configOptions['--allow-fs-write']) {
        if (typeof configOptions['--allow-fs-write'] === 'string') {
          configOptions['--allow-fs-write'] = [
            configOptions['--allow-fs-write'],
          ]
        }
        if (configOptions['--allow-fs-write'] === true) {
          return // none of this matters
        }
      } else {
        // do this for both undefined and false
        configOptions['--allow-fs-write'] = []
      }
      const tmp = tmpdir()
      configOptions['--allow-fs-write'].push(tmp)
      // because macos is being weird
      const tmpRealPath = realpathSync(tmp)
      if (tmpRealPath !== tmp) {
        configOptions['--allow-fs-write'].push(tmpRealPath)
      }
    }
  }

  /** @param {ConfigOptions} configOptions */
  function makeFlagsFromConfig(configOptions) {
    return Object.entries(configOptions)
      .map(([arg, value]) => {
        if (typeof value === 'boolean') {
          return value ? arg : ''
        } else if (Array.isArray(value)) {
          return value.map((v) => `${arg}="${v}"`).join(' ')
        } else {
          return `${arg}="${value}"`
        }
      })
      .filter(Boolean)
      .join(' ')
  }

  /**
   * Checks the config obtained from package.json and puts it in as NODE_OPTIONS
   *
   * @param {string | undefined} existingOptions
   * @param {ConfigOptions} configOptions
   * @param {NodeJS.ProcessEnv} env
   */
  function installNodeOptions(existingOptions, configOptions, env) {
    if (!configOptions) {
      return existingOptions || ''
    }

    customizePermissionsConfig(configOptions, env)

    permissionsModelCompatibilityExtensions(configOptions, env)

    const confOption = makeFlagsFromConfig(configOptions)

    return `${existingOptions || ''} ${confOption.trim()}`.trim()
  }

  /**
   * Filter environment variables based on ban keywords
   *
   * @param {NodeJS.ProcessEnv} env
   * @param {string} lavamoatDir
   * @returns {NodeJS.ProcessEnv}
   */
  function filterEnv(env, lavamoatDir) {
    const banFilePath = pathJoin(lavamoatDir, '.env.ban.json')
    let banConfig

    try {
      banConfig = readJsonFile(banFilePath)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[LavaMoat] Warning: Failed to read .env.ban.json: ${message}.`
      )
      return env
    }
    let banKeywords = []
    try {
      if (Array.isArray(banConfig)) {
        banKeywords.push(...banConfig)
      } else {
        throw Error(`Expected .env.ban.json to contain an array of keywords`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[LavaMoat] Warning: Failed to read .env.ban.json: ${message}.`
      )
      return env
    }

    /** @type {NodeJS.ProcessEnv} */
    const filteredEnv = {}
    const bannedEnv = []
    banKeywords = banKeywords.map((keyword) => keyword.toLowerCase())
    for (const [key, value] of Object.entries(env)) {
      if (
        !key.toLowerCase().startsWith('npm_config') &&
        banKeywords.some((keyword) => key.toLowerCase().includes(keyword))
      ) {
        bannedEnv.push(key)
      } else {
        filteredEnv[key] = value
      }
    }
    if (bannedEnv.length > 0) {
      console.error(
        `[LavaMoat] Warning: The following environment variables were banned: ${bannedEnv.join(', ')}`
      )
    }
    return filteredEnv
  }

  /** @param {string} PATH */
  function envPathOpinions(PATH) {
    const pathFragments = PATH.split(pathDelimiter)
    // This is to eliminate bin confusion attacks.
    // Find node_modules/.bin and remove it, put it on the end that gets looked up last when looking for a name in the path.

    /** @type {string[]} */
    const filteredFragments = []
    /** @type {string[]} */
    const nodeModulesBinFragments = []

    for (const fragment of pathFragments) {
      if (pathBinMatcher(fragment)) {
        nodeModulesBinFragments.push(fragment)
      } else {
        filteredFragments.push(fragment)
      }
    }
    // Why would there be multiple bin fragments? In a npm workspace, local bin and workspace root bin is added
    filteredFragments.push(...nodeModulesBinFragments)
    return filteredFragments.join(pathDelimiter)
  }

  return {
    processEnv: (existingEnv) => {
      const scriptsConfig = readScriptsConfig(projectRoot)
      const config = readConfig({
        scriptsConfig,
        scriptName,
        projectRoot,
      })

      // Smell: Windows environment variables are case-insensitive, but Node's process.env
      // might expose it as 'Path' instead of 'PATH'. Checking both ensures it doesn't get wiped out.

      const existingPath = existingEnv.PATH || existingEnv.Path || ''

      const lavamoatDir = pathJoin(projectRoot, 'lavamoat')

      const fixedEnv = {
        ...filterEnv(existingEnv, lavamoatDir),
        PATH: envPathOpinions(existingPath),
        NODE_OPTIONS: installNodeOptions(
          existingEnv.NODE_OPTIONS,
          config.nodeOptions,
          existingEnv
        ),
      }
      return fixedEnv
    },
  }
}


