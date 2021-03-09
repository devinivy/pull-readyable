# pull-readyable
dependencies and completion using [pull-streams](https://github.com/pull-stream/pull-stream)

[![Build Status](https://travis-ci.com/devinivy/pull-readyable.svg?branch=main)](https://travis-ci.com/devinivy/pull-readyable) [![Coverage Status](https://coveralls.io/repos/devinivy/pull-readyable/badge.svg?branch=main&service=github)](https://coveralls.io/github/devinivy/pull-readyable?branch=main)

## Installation
```sh
npm install pull-readyable
```

## Usage
At its simplest, a readyable is a readable pull-streams with two properties:
 - it produces no values, and eventually either completes or errors.
 - it may be pulled multiple times, and its completion is cached for future consumers.

However, it comes with some additional bells and whistles to help you manage dependencies and handlers for each readyable too.  Readyables can be snapped together in a couple different ways, making them well-suited to create extensible lifecycles, as in [secret-stack-lifecycle](https://github.com/devinivy/secret-stack-lifecycle).  For more information see the example and API docs below.

### Example
```js
'use strict'

const fs = require('fs')
const { createReadyable, during, run } = require('pull-readyable')

// Create a db object with a lifecycle based on readyables
const db = {
  lifecycle: { start: createReadyable() },
  file: null,
  fd: null,
  open(file) {
    db.file = file
    db.lifecycle.start.handle((cb) => {
      fs.open(file, (err, fd) => {
        if (err) return cb(err)
        db.fd = fd
        cb()
      })
    }).go()
  }
}

// Impose a filetype check during db start by hooking into the db lifecycle
const checkFiletype = during(db.lifecycle.start)
checkFiletype.handle((cb) => {
  if (!db.file.endsWith('.db')) {
    return cb(new Error('Bad db filetype'))
  }
  cb()
})

db.open('my-file.db')

run(db.lifecycle.start, (err) => {
  if (err) throw err // If the filetype check failed, we'd see it here.
  // Now work with db, knowing that it has started with the filetype check.
  // Notice you could also have hooked into checkFiletype too, as it is also a readyable!
})
```

## API
### `createReadyable()`
Returns a readyable, which is a readable pull stream which will produce no values, and eventually either completes or errors.  A readyable may be pulled multiple times: its result is cached, and if it is pulled after it has already ended, it will immediately complete or error again.  A readyable has dependencies, which are pull-streams, and handlers, which are callbacks.  When you call `readyable.go()` the readyable will start processing.  First its dependencies will complete, then its handlers will run in parallel, and finally the readyable will end.

#### `readyable.dependOn(stream)`
> also `dependOn(readyable, stream)`

Sets `stream` as a dependency of `readyable`: it will not run its handlers or complete until `stream` ends.  If `stream` errors, that error will be propagated to `readyable`.  The `stream` will not be pulled until `readyable.go()` has started the readyable.  You may also pass an array of streams and they will be combined using `all()`.  Returns `readyable`.

#### `readyable.handle(cb)`
> also `handle(readyable, cb)`

Sets callback `cb` as a handler of `readyable`: it will not complete until `cb` is called, which can only occur after `readyable.go()` has started the readyable.  The `cb` callback may be called with an error, which will be propagated to `readyable`.  Returns `readyable`.

#### `readyable.go()`
> also `go(readyable)`

Indicates that all dependencies and handlers have been added using `readyable.dependOn()` and `readyable.handle()`: these methods will fail if they are called after `readyable.go()`.  Once `readyable.go()` is called, dependencies will be pulled in parallel.  Once the dependencies complete, the handlers will be run in parallel, and then the readyable will complete.  May only be called once.  Returns `readyable`.

#### `readyable.isReady()`
> also `isReady(readyable)`

Returns `true` if the readyable has completed, i.e. "is ready."  Returns `false` if the readyable has not yet completed, and returns `null` if the readyable has errored.

#### `readyable.during([{ dependOn }])`
> also `during(readyable, [{ dependOn }])`

Returns a new readyable that is automatically run when `readyable.go()` is called.  When `dependOn` is `true`, which is the default, this new readyable is also marked as a dependency of `readyable`.

### `readyableish(stream)`
> alias `cacheResult(stream)`

Returns a pull-stream based on `stream` with the basic properties of a readyable: a. it will produce no values and either completes or errors, and b. it may be pulled multiple times and its completion is cached.

### `all(streams)`
Returns a pull-stream combining each stream in the array of `streams`.  It is built using [pull-many](https://github.com/pull-stream/pull-many), and once pulled the streams run in parallel.  You may also pass a single stream.

### `run(stream, cb)`
Runs the pull-stream `stream` until it ends, then calls `cb`.  It's really just short for `pull(stream, pull.onEnd(cb))`.

### `cb(readyable)`
Returns a callback, and adds a dependency to `readyable` that completes when that callback is called.
