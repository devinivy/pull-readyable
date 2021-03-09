'use strict'

const fs = require('fs')
const { createReadyable, during, run } = require('pull-readyable')

// Create a db object with a lifecycle based on readyables
const db = {
  lifecycle: { start: createReadyable() },
  file: null,
  fd: null,
  open (file) {
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
