'use strict'

const test = require('tape')
const pull = require('pull-stream')
const {
  createReadyable,
  readyableish,
  cacheResult,
  isReady,
  go,
  dependOn,
  handle,
  during,
  run,
  all,
  cb
} = require('..')

test('readyable caches its result, series.', (t) => {
  t.plan(2)
  const readyable = createReadyable()
  readyable.handle((cb) => {
    setTimeout(cb, 10)
  }).go()
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
    pull(readyable, pull.onEnd((err) => {
      t.error(err)
    }))
  }))
})

test('readyable caches its result, parallel.', (t) => {
  t.plan(2)
  const readyable = createReadyable()
  readyable.handle((cb) => {
    setTimeout(cb, 10)
  }).go()
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
  }))
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
  }))
})

test('readyable caches its result, delayed run.', (t) => {
  t.plan(2)
  const readyable = createReadyable()
  readyable.handle((cb) => {
    setTimeout(cb, 10)
  })
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
  }))
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
  }))
  setTimeout(readyable.go, 10)
})

test('readyable run() pulls readyables.', (t) => {
  t.plan(3)
  const readyable = createReadyable()
  readyable.handle((cb) => {
    setTimeout(cb, 10)
  }).go()
  run(readyable, (err) => {
    t.error(err)
    run(readyable, (err) => {
      t.error(err)
    })
  })
  run(readyable, (err) => {
    t.error(err)
  })
})

test('readyable processes handlers in parallel once run.', (t) => {
  const readyable = createReadyable()
  const handlers = []
  readyable.handle((cb) => {
    t.deepEquals(handlers, [])
    handlers.push('10-start')
    setTimeout(() => {
      t.deepEquals(handlers, ['10-start', '15-start', '20-start'])
      handlers.push('10-end')
      cb()
    }, 10)
  })
  readyable.handle((cb) => {
    t.deepEquals(handlers, ['10-start'])
    handlers.push('15-start')
    setTimeout(() => {
      t.deepEquals(handlers, ['10-start', '15-start', '20-start', '10-end'])
      handlers.push('15-end')
      cb()
    }, 15)
  })
  readyable.handle((cb) => {
    t.deepEquals(handlers, ['10-start', '15-start'])
    handlers.push('20-start')
    setTimeout(() => {
      t.deepEquals(handlers, ['10-start', '15-start', '20-start', '10-end', '15-end']) // 10, 15 must have been in parallel since 10 + 15 > 20
      handlers.push('20-end')
      cb()
    }, 20)
  })
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
    t.deepEquals(handlers, ['10-start', '15-start', '20-start', '10-end', '15-end', '20-end'])
    t.end()
  }))
  setTimeout(() => {
    t.deepEquals(handlers, [])
    readyable.go()
    t.deepEquals(handlers, ['10-start', '15-start', '20-start'])
  }, 25)
})

test('readyable processes dependencies in parallel prior to handlers once run.', (t) => {
  const dependencyA = createReadyable()
  const dependencyB = createReadyable()
  const dependencyC = createReadyable()
  const readyable = createReadyable()
  const handlers = []
  dependencyA.handle((cb) => {
    handlers.push('dependencyA-start')
    setTimeout(() => {
      handlers.push('dependencyA-end')
      cb()
    }, 10)
  })
  dependencyB.handle((cb) => {
    handlers.push('dependencyB-start')
    setTimeout(() => {
      handlers.push('dependencyB-end')
      cb()
    }, 15)
  })
  dependencyC.handle((cb) => {
    handlers.push('dependencyC-start')
    setTimeout(() => {
      handlers.push('dependencyC-end')
      cb()
    }, 20)
  })
  readyable.handle((cb) => {
    handlers.push('readyable-start')
    setTimeout(() => {
      handlers.push('readyable-end')
      cb()
    }, 5)
  })
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
    t.deepEquals(handlers, ['dependencyA-start', 'dependencyB-start', 'dependencyC-start', 'dependencyA-end', 'dependencyB-end', 'dependencyC-end', 'readyable-start', 'readyable-end'])
    t.end()
  }))
  readyable.dependOn([dependencyA, dependencyB])
  readyable.dependOn(dependencyC)
  t.deepEquals(handlers, [])
  dependencyA.go()
  dependencyB.go()
  dependencyC.go()
  readyable.go()
  t.deepEquals(handlers, ['dependencyA-start', 'dependencyB-start', 'dependencyC-start'])
})

test('readyable chaining dependencies.', (t) => {
  const dependencyA = createReadyable()
  const dependencyB = createReadyable()
  const readyable = createReadyable()
  const handlers = []
  dependencyA.handle((cb) => {
    handlers.push('dependencyA-start')
    setTimeout(() => {
      handlers.push('dependencyA-end')
      cb()
    }, 5)
  })
  dependencyB.handle((cb) => {
    handlers.push('dependencyB-start')
    setTimeout(() => {
      handlers.push('dependencyB-end')
      dependencyA.go()
      cb()
    }, 15)
  })
  readyable.handle((cb) => {
    handlers.push('readyable-start')
    setTimeout(() => {
      handlers.push('readyable-end')
      cb()
    }, 5)
  })
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
    t.deepEquals(handlers, ['dependencyB-start', 'dependencyB-end', 'dependencyA-start', 'dependencyA-end', 'readyable-start', 'readyable-end'])
    t.end()
  }))
  readyable.dependOn([dependencyA, dependencyB])
  t.deepEquals(handlers, [])
  dependencyB.go()
  readyable.go()
  t.deepEquals(handlers, ['dependencyB-start'])
})

test('readyable during() with default dependOn.', (t) => {
  const readyable = createReadyable()
  const dependency = readyable.during()
  const handlers = []
  dependency.handle((cb) => {
    handlers.push('dependency-start')
    setTimeout(() => {
      handlers.push('dependency-end')
      cb()
    }, 15)
  })
  readyable.handle((cb) => {
    handlers.push('readyable-start')
    setTimeout(() => {
      handlers.push('readyable-end')
      cb()
    }, 5)
  })
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
    t.deepEquals(handlers, ['dependency-start', 'dependency-end', 'readyable-start', 'readyable-end'])
    t.end()
  }))
  t.deepEquals(handlers, [])
  readyable.go()
  t.deepEquals(handlers, ['dependency-start'])
})

test('readyable during() with dependOn false.', (t) => {
  const readyableA = createReadyable()
  const readyableB = readyableA.during({ dependOn: false })
  const handlers = []
  readyableA.handle((cb) => {
    handlers.push('readyableA-start')
    setTimeout(() => {
      handlers.push('readyableA-end')
      cb()
    }, 5)
  })
  readyableB.handle((cb) => {
    handlers.push('readyableB-start')
    setTimeout(() => {
      handlers.push('readyableB-end')
      cb()
    }, 15)
  })
  pull(readyableA, pull.onEnd((err) => {
    t.error(err)
    t.deepEquals(handlers, ['readyableB-start', 'readyableA-start', 'readyableA-end'])
    pull(readyableB, pull.onEnd((err) => {
      t.error(err)
      t.deepEquals(handlers, ['readyableB-start', 'readyableA-start', 'readyableA-end', 'readyableB-end'])
      t.end()
    }))
  }))
  t.deepEquals(handlers, [])
  readyableA.go()
  t.deepEquals(handlers, ['readyableB-start', 'readyableA-start'])
})

test('readyable cb() as a one-off dependency, success.', (t) => {
  t.plan(6)
  const readyable = createReadyable()
  const readyableCb = cb(readyable)
  const handlers = []
  setTimeout(() => {
    t.deepEquals(handlers, [])
    readyableCb()
    t.deepEquals(handlers, ['readyable-start'])
  }, 15)
  readyable.handle((cb) => {
    handlers.push('readyable-start')
    setTimeout(() => {
      handlers.push('readyable-end')
      cb()
    }, 5)
  })
  pull(readyable, pull.onEnd((err) => {
    t.error(err)
    t.deepEquals(handlers, ['readyable-start', 'readyable-end'])
  }))
  t.deepEquals(handlers, [])
  readyable.go()
  t.deepEquals(handlers, [])
})

test('readyable cb() as a one-off dependency, error.', (t) => {
  t.plan(6)
  const readyable = createReadyable()
  const readyableCb = cb(readyable)
  const handlers = []
  setTimeout(() => {
    t.deepEquals(handlers, [])
    readyableCb(new Error())
    t.deepEquals(handlers, [])
  }, 15)
  readyable.handle((cb) => {
    handlers.push('readyable-start')
    setTimeout(() => {
      handlers.push('readyable-end')
      cb()
    }, 5)
  })
  pull(readyable, pull.onEnd((err) => {
    t.ok(err)
    t.deepEquals(handlers, [])
  }))
  t.deepEquals(handlers, [])
  readyable.go()
  t.deepEquals(handlers, [])
})

test('readyable isReady() indicates not-ready, ready.', (t) => {
  t.plan(5)
  const readyable = createReadyable()
  t.equal(readyable.isReady(), false)
  readyable.handle((cb) => {
    t.equal(readyable.isReady(), false)
    setTimeout(cb, 10)
  }).go()
  run(readyable, (err) => {
    t.error(err)
    t.equal(readyable.isReady(), true)
  })
  t.equal(readyable.isReady(), false)
})

test('readyable isReady() indicates not-ready, errored.', (t) => {
  t.plan(5)
  const readyable = createReadyable()
  t.equal(readyable.isReady(), false)
  readyable.handle((cb) => {
    t.equal(readyable.isReady(), false)
    setTimeout(() => cb(new Error()), 10)
  }).go()
  run(readyable, (err) => {
    t.ok(err)
    t.equal(readyable.isReady(), null)
  })
  t.equal(readyable.isReady(), false)
})

test('readyable utilities isReady(), go(), handle().', (t) => {
  const readyable = createReadyable()
  go(handle(readyable, (cb) => {
    setTimeout(() => {
      t.ok(true)
      cb()
    }, 10)
  }))
  t.equal(isReady(readyable), false)
  run(readyable, (err) => {
    t.error(err)
    t.equal(isReady(readyable), true)
    t.end()
  })
})

test('readyable utilities dependOn(), during().', (t) => {
  const readyable = createReadyable()
  const hooked = during(readyable)
  const dep = createReadyable()
  dependOn(hooked, dep)

  const calls = []
  readyable.handle((cb) => {
    calls.push('readyable-start')
    setTimeout(() => {
      calls.push('readyable-end')
      cb()
    }, 5)
  })
  hooked.handle((cb) => {
    calls.push('hooked-start')
    setTimeout(() => {
      calls.push('hooked-end')
      cb()
    }, 10)
  })
  dep.handle((cb) => {
    calls.push('dep-start')
    setTimeout(() => {
      calls.push('dep-end')
      cb()
    }, 15)
  })

  go(readyable)
  setTimeout(() => {
    calls.push('dep-go')
    go(dep)
  }, 20)

  run(readyable, (err) => {
    t.error(err)
    t.deepEqual(calls, ['dep-go', 'dep-start', 'dep-end', 'hooked-start', 'hooked-end', 'readyable-start', 'readyable-end'])
    t.end()
  })
})

test('readyable utilities cacheResult(), readyableish(), success.', (t) => {
  t.plan(10)
  t.equal(cacheResult, readyableish)
  const stream = readyableish(pull(
    pull.values([1, 2, 3, 4, 5]),
    pull.asyncMap((num, cb) => setTimeout(() => cb(null, num), num))
  ))
  const start = Date.now()
  pull(stream, pull.collect((err, items) => {
    t.error(err)
    t.deepEqual(items, [])
    t.ok(Date.now() - start > 10)
  }))
  pull(stream, pull.collect((err, items) => {
    t.error(err)
    t.deepEqual(items, [])
    t.ok(Date.now() - start > 10)
    pull(stream, pull.collect((err, items) => {
      t.error(err)
      t.deepEqual(items, [])
      t.ok(Date.now() - start > 10)
    }))
  }))
})

test('readyable utilities cacheResult(), readyableish(), error.', (t) => {
  t.plan(10)
  t.equal(cacheResult, readyableish)
  const stream = readyableish(pull(
    pull.values([1, 2, 3, 4, 5]),
    pull.asyncMap((num, cb) => setTimeout(() => cb(num === 5 && new Error('Bad 5'), num), num))
  ))
  const start = Date.now()
  pull(stream, pull.collect((err, items) => {
    t.equal(err && err.message, 'Bad 5')
    t.deepEqual(items, [])
    t.ok(Date.now() - start > 10)
  }))
  pull(stream, pull.collect((err, items) => {
    t.equal(err && err.message, 'Bad 5')
    t.deepEqual(items, [])
    t.ok(Date.now() - start > 10)
    pull(stream, pull.collect((err, items) => {
      t.equal(err && err.message, 'Bad 5')
      t.deepEqual(items, [])
      t.ok(Date.now() - start > 10)
    }))
  }))
})

test('readyable utility all().', (t) => {
  const odd = pull(
    pull.values([1, 3, 5]),
    pull.asyncMap((num, cb) => setTimeout(() => cb(null, num)))
  )
  const even = pull(
    pull.values([2, 4, 6]),
    pull.asyncMap((num, cb) => setTimeout(() => cb(null, num)))
  )
  pull(all([odd, even]), pull.collect((err, items) => {
    t.error(err)
    t.deepEqual(items, [1, 2, 3, 4, 5, 6])
    t.end()
  }))
})
