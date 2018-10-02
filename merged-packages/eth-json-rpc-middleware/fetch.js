const fetch = global.fetch || require('fetch-ponyfill')().fetch
const url = require('url')
const retry = require('async/retry')
const waterfall = require('async/waterfall')
const asyncify = require('async/asyncify')
const JsonRpcError = require('json-rpc-error')
const promiseToCallback = require('promise-to-callback')
const btoa = require('btoa')

module.exports = createFetchMiddleware
module.exports.createFetchConfigFromReq = createFetchConfigFromReq

const RETRIABLE_ERRORS = [
  // ignore server overload errors
  'Gateway timeout',
  'ETIMEDOUT',
  // ignore server sent html error pages
  // or truncated json responses
  'SyntaxError',
]

function createFetchConfigFromReq({ req, rpcUrl, originHttpHeaderKey }) {
  const parsedUrl = url.parse(rpcUrl)
  const fetchUrl = normalizeUrlFromParsed(parsedUrl)

  // prepare payload
  const payload = Object.assign({}, req)
  // extract 'origin' parameter from request
  const originDomain = payload.origin
  delete payload.origin
  // serialize request body
  const serializedPayload = JSON.stringify(payload)

  // configure fetch params
  const fetchParams = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: serializedPayload,
  }

  // encoded auth details as header (not allowed in fetch url)
  if (parsedUrl.auth) {
    const encodedAuth = btoa(parsedUrl.auth)
    fetchParams.headers['Authorization'] = `Basic ${encodedAuth}`
  }

  // optional: add request origin as header
  if (originHttpHeaderKey && originDomain) {
    fetchParams.headers[originHttpHeaderKey] = originDomain
  }

  return { fetchUrl, fetchParams }
}

function normalizeUrlFromParsed(parsedUrl) {
  let result = ''
  result += parsedUrl.protocol
  if (parsedUrl.slashes) result += '//'
  result += parsedUrl.hostname
  if (parsedUrl.port) {
    result += `:${parsedUrl.port}`
  }
  result += `${parsedUrl.path}`
  return result
}

function createFetchMiddleware ({ rpcUrl, originHttpHeaderKey }) {
  return (req, res, next, end) => {

    const { fetchUrl, fetchParams } = createFetchConfigFromReq({ req, rpcUrl, originHttpHeaderKey })

    retry({
      times: 5,
      interval: 1000,
      errorFilter: (err) => {
        const errMsg = err.toString()
        return RETRIABLE_ERRORS.some(phrase => errMsg.includes(phrase))
      },
    }, (cb) => {
      let fetchRes
      let fetchBody
      waterfall([
        // make request
        (cb) => promiseToCallback(fetch(fetchUrl, fetchParams))(cb),
        asyncify((_fetchRes) => { fetchRes = _fetchRes }),
        // check for http errrors
        (_, cb) => checkForHttpErrors(fetchRes, cb),
        // buffer body
        (cb) => promiseToCallback(fetchRes.text())(cb),
        asyncify((rawBody) => { fetchBody = JSON.parse(rawBody) }),
        // parse response body
        (_, cb) => parseResponse(fetchRes, fetchBody, cb)
      ], cb)
    }, (err, result) => {
      if (err) return end(err)
      // append result and complete
      res.result = result
      end()
    })
  }
}

function checkForHttpErrors (res, cb) {
  // check for errors
  switch (res.status) {
    case 405:
      return cb(new JsonRpcError.MethodNotFound())

    case 418:
      return cb(createRatelimitError())

    case 503:
    case 504:
      return cb(createTimeoutError())

    default:
      return cb()
  }
}

function parseResponse (res, body, cb) {
  // check for error code
  if (res.status !== 200) {
    return cb(new JsonRpcError.InternalError(body))
  }
  // check for rpc error
  if (body.error) return cb(new JsonRpcError.InternalError(body.error))
  // return successful result
  cb(null, body.result)
}

function createRatelimitError () {
  let msg = `Request is being rate limited.`
  const err = new Error(msg)
  return new JsonRpcError.InternalError(err)
}

function createTimeoutError () {
  let msg = `Gateway timeout. The request took too long to process. `
  msg += `This can happen when querying logs over too wide a block range.`
  const err = new Error(msg)
  return new JsonRpcError.InternalError(err)
}
