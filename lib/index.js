'use strict'

const assert = require('assert')
const pull = require('pull-stream')
const many = require('pull-many')
const cache = require('pull-cache')
const defer = require('pull-defer')

module.exports = {
  createReadyable,
  readyableish: cacheResult,
  cacheResult,
  isReady,
  go,
  dependOn,
  handle,
  during,
  run,
  all,
  cb
}

function createReadyable () {
  const durings = []
  const dependencies = []
  const handlers = []

  let gone = false
  let ready = false

  const deferredDependencies = defer.source()
  const deferredHandlers = defer.source()

  const readyable = cacheResult(
    pull(
      pull.values([
        deferredDependencies, // Resolve dependencies
        deferredHandlers // Kick off handlers
      ]),
      pull.flatten(), // Run above streams in sequence
      pull.through(null, (err) => {
        ready = err ? null : true
      })
    )
  )

  return Object.assign(readyable, {
    isReady () {
      return ready
    },
    go () {
      assert(!gone)
      gone = true

      durings.forEach((during) => during.go())
      deferredDependencies.resolve(all(dependencies))
      deferredHandlers.resolve(all(handlers.map(wait)))

      pull(readyable, pull.onEnd(ignore)) // Make it flow
      return readyable
    },
    dependOn (deps) {
      assert(!gone)
      dependencies.push(...([].concat(deps)))
      return readyable
    },
    handle (handler) {
      assert(!gone)
      handlers.push(handler)
      return readyable
    },
    during ({ dependOn = true } = {}) {
      assert(!gone)
      const during = createReadyable()
      durings.push(during)
      if (dependOn) {
        readyable.dependOn(during)
      }
      return during
    }
  })
}

function isReady (readyable) {
  return readyable.isReady()
}

function go (readyable) {
  return readyable.go()
}

function dependOn (readyable, deps) {
  return readyable.dependOn(deps)
}

function handle (readyable, handler) {
  return readyable.handle(handler)
}

function during (readyable, opts) {
  return readyable.during(opts)
}

function run (stream, cb) {
  return pull(stream, pull.onEnd(cb))
}

const forget = pull.filter(ignore)

function cacheResult (stream) {
  return pull(stream, forget, cache)()
}

function all (streams) {
  return many([].concat(streams).reverse())
}

function wait (handler) {
  return pull(
    pull.once('signal'),
    pull.asyncMap((_, cb) => handler(cb))
  )
}

function cb (readyable) {
  const cbStream = defer.source()
  readyable.dependOn(cbStream)
  return (err) => {
    cbStream.resolve(err ? pull.error(err) : pull.empty())
  }
}

function ignore () {
  return null
}
