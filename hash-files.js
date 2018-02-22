"use strict";

let crypto = require("crypto");
let util = require("util");
let fs = require("fs");

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

function hashFiles(fullPaths, options) {
  if (options == null) options = {};
  let hash = new Hash();
  let filesFound = 0;
  for (let i = 0; i < fullPaths.length; i++) {
    filesFound += _hashFileOrDirectory(hash, fullPaths[i]);
  }
  if (options.failIfNoFilesFound && filesFound === 0) {
    throw new Error(
      "None of the following files exist: " + util.inspect(fullPaths)
    );
  }
  return hash.digest();
}

const NOT_FOUND_TAG = 0;
const FILE_TAG = 1;
const DIR_TAG = 2;
const OTHER_FILE_TYPE_TAG = 3;

function _hashFileOrDirectory(hash, fullPath) {
  let filesFound = 0;
  let stats;
  try {
    stats = fs.statSync(fullPath);
  } catch (e) {
    hash.updateUInt8(NOT_FOUND_TAG);
    return 0;
  }
  filesFound += 1;
  hash.updateUInt16(stats.mode);
  if (stats.isDirectory()) {
    hash.updateUInt8(DIR_TAG);
    let entries;
    try {
      entries = fs.readdirSync(fullPath).sort();
    } catch (err) {
      hash.updateNumber(-1);
      return 0; // treat stat but failed readdir as no file found
    }
    hash.updateNumber(entries.length);
    for (let i = 0; i < entries.length; i++) {
      hash.updateString(entries[i]);
      hash.updateUInt8(0);
      filesFound += _hashFileOrDirectory(hash, fullPath + "/" + entries[i]);
    }
  } else if (stats.isFile()) {
    hash.updateUInt8(FILE_TAG);
    hash.updateUInt48(stats.mtime.getTime());
    hash.updateNumber(stats.size);
  } else {
    hash.updateUInt8(OTHER_FILE_TYPE_TAG);
  }
  return filesFound;
}
