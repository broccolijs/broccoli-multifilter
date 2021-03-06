"use strict";

let fs = require("fs");
let path = require("path");
let Plugin = require("broccoli-plugin");
let mapSeries = require("promise-map-series");
let MergeTrees = require("merge-trees");
let rimraf = require("rimraf");
let hashFiles = require("./hash-files");

class MultiFilter extends Plugin {
  constructor(inputNodes, options) {
    if (options == null) options = {};
    super(inputNodes, {
      name: options.name,
      annotation: options.annotation
    });
    this._cacheCounter = 0;
  }

  buildAndCache(tokens, buildFileCallback) {
    _verifyTokens(tokens);

    let oldCache = this._multiFilterCache || new Map();
    let oldOutputDirectories = this._multiFilterOutputDirectories || [];
    let newCache = new Map();
    let newOutputDirectories = [];

    // Reset cache here so that if something goes unexpectedly wrong in our
    // caching logic, we start with an empty cache on the next build. We'll leak
    // files, but at least we won't get into a "wedged" state.
    this._multiFilterCache = new Map();
    this._multiFilterOutputDirectories = new Set();

    let buildError = null;

    this._stats = {
      cacheMisses: [],
      cacheHits: []
    };

    return mapSeries(tokens, token => {
      let cacheItem = oldCache.get(token);

      if (buildError) {
        // We encountered an error in a previous file. For each remaining file,
        // carry over the cacheItem without building anything.
        if (cacheItem != null) {
          newOutputDirectories.push(cacheItem.outputDirectoryPath);
          newCache.set(token, cacheItem);
        }
        return; // continue
      }

      if (cacheItem != null) {
        let currentHash = null;
        try {
          currentHash = hashFiles(cacheItem.dependencies);
        } catch (e) {
          // ignore errors
        }
        if (currentHash != null && cacheItem.statHash === currentHash) {
          // Cache hit
          newOutputDirectories.push(cacheItem.outputDirectoryPath);
          newCache.set(token, cacheItem);
          this._stats.cacheHits.push(token);
          return; // continue
        }
      }

      // No cache hit. Build file.
      this._stats.cacheMisses.push(token);

      let outputDirectoryPath = this._makeCacheDir();
      newOutputDirectories.push(outputDirectoryPath);

      return Promise.resolve()
        .then(() => {
          return buildFileCallback.call(this, token, outputDirectoryPath);
        })
        .then(obj => {
          if (obj == null || obj.dependencies == null)
            throw new Error(
              "buildAndCache callback must return an object { dependencies: [...] }"
            );
          let dependencies = obj.dependencies;
          if (!Array.isArray(dependencies)) {
            throw new Error("Expected dependencies array, got " + dependencies);
          }
          if (dependencies.length === 0)
            throw new Error(
              "buildAndCache callback must return at least one dependency, including the input file itself"
            );

          // There is an unavoidable race condition here: We should be using the
          // file stats at the time the compiler was using them (or before), but
          // we're stat'ing them after. As a result, if a file gets changed
          // immediately after it was compiled, but before it is hashed here, we
          // might miss a change.
          let statHash = hashFiles(dependencies);
          let cacheItem = {
            outputDirectoryPath: outputDirectoryPath,
            dependencies: dependencies,
            statHash: statHash
          };
          newCache.set(token, cacheItem);
        })
        .catch(error => {
          // Record error and continue, so we don't purge the remaining
          // outputDirectories.
          buildError = error;
        });
    })
      .finally(() => {
        this._multiFilterCache = newCache;
        this._multiFilterOutputDirectories = newOutputDirectories;

        _purgeOutputDirectories(oldOutputDirectories, newOutputDirectories);
      })
      .then(() => {
        if (buildError) {
          throw buildError;
        }
      })
      .then(() => {
        new MergeTrees(newOutputDirectories, this.outputPath, {
          overwrite: false
        }).merge();
      });
  }

  _makeCacheDir() {
    // We could generate pretty paths from the token (input file path), but for
    // now we just use numbers
    let p = this.cachePath + path.sep + this._cacheCounter;
    fs.mkdirSync(p);
    this._cacheCounter++;
    return p;
  }
}

module.exports = MultiFilter;

function _verifyTokens(tokens) {
  let tokenSet = new Set();
  for (let token of tokens) {
    if (typeof token !== "string") {
      throw new Error(
        "Expected a string (input file name or similar), got " + token
      );
    }
    if (tokenSet.has(token)) {
      throw new Error("Duplicate input file: " + token);
    }
    tokenSet.add(token);
  }
}

function _purgeOutputDirectories(oldOutputDirectories, newOutputDirectories) {
  // We only turn the newOutputDirectories into a Set here, rather than having
  // it be a Set in the first place, because we need to preserve ordering to get
  // deterministic merge errors.
  let newSet = new Set(newOutputDirectories);
  for (let outputDirectoryPath in oldOutputDirectories) {
    if (!newSet.has(outputDirectoryPath)) {
      rimraf.sync(outputDirectoryPath);
    }
  }
}
