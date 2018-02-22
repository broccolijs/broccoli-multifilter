"use strict";

let crypto = require("crypto");
let fs = require("fs");
let path = require("path");

module.exports = hashFiles;

class Hash {
  constructor() {
    this.hash = crypto.createHash("md4");
  }

  updateBuffer(buf) {
    this.hash.update(buf);
  }

  updateString(s) {
    this.hash.update(new Buffer(s));
  }

  updateNumber(n) {
    // We would prefer to use Buffer.allocUnsafe here and below, but it isn't
    // available in Node 4.0.0.
    let buf = new Buffer(8);
    buf.writeDoubleLE(n, 0);
    this.hash.update(buf);
  }

  updateUInt48(n) {
    let buf = new Buffer(6);
    buf.writeUIntLE(n, 0, 6, true);
    this.hash.update(buf);
  }

  updateUInt32(n) {
    let buf = new Buffer(4);
    buf.writeUInt32LE(n, 0, true);
    this.hash.update(buf);
  }

  updateUInt16(n) {
    let buf = new Buffer(2);
    buf.writeUInt16LE(n, 0, true);
    this.hash.update(buf);
  }

  updateUInt8(n) {
    let buf = new Buffer(1);
    buf.writeUInt8(n, 0, true);
    this.hash.update(buf);
  }

  digest() {
    return this.hash.digest("hex");
  }
}

function hashFiles(fullPaths) {
  let hash = new Hash();
  for (let i = 0; i < fullPaths.length; i++) {
    updateHash(hash, fullPaths[i]);
  }
  return hash.digest();
}

const FILE_TAG = 0;
const DIR_TAG = 1;
// We do not currently support depending on non-existent files
// const NOT_FOUND_TAG = 2;

function updateHash(hash, fullPath) {
  let stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    hash.updateUInt8(DIR_TAG);
    let entries;
    entries = fs.readdirSync(fullPath).sort();
    hash.updateNumber(entries.length);
    for (let i = 0; i < entries.length; i++) {
      hash.updateString(entries[i]);
      hash.updateUInt8(0);
      updateHash(hash, fullPath + path.sep + entries[i]);
    }
  } else if (stats.isFile()) {
    hash.updateUInt8(FILE_TAG);
    hash.updateUInt16(stats.mode);
    hash.updateUInt48(stats.mtime.getTime());
    hash.updateNumber(stats.size);
  } else {
    throw new Error("Unexpected file type: " + fullPath);
  }
}
