# broccoli-multifilter

[![Build Status](https://travis-ci.org/broccolijs/broccoli-multifilter.svg?branch=master)](https://travis-ci.org/broccolijs/broccoli-multifilter)

This is a helper base class for Broccoli plugins similar to
[broccoli-filter](https://github.com/broccolijs/broccoli-filter). The
broccoli-filter base class maps 1 input file into 1 output file at a time. As a
result, plugins for compilers that have `include` directives to include other
dependent files cannot use broccoli-filter, since broccoli-filter's caching
logic cannot accomodate dependencies. By contrast, broccoli-multifilter allows
you to provide a list of dependencies for each input file, thereby mapping *m*
input files into *n* output files at a time.

## Installation

```sh
npm install --save broccoli-multifilter
```

This package requires Node 6 or newer.

## Usage example

```
let Multifilter = require("broccoli-multifilter");

class MyPlugin extends Multifilter {
  build() {
    let inputFiles = ["foo.js"]
    return this.buildAndCache(
      inputFiles,
      (inputFile, outputDirectory) => {
        let fullInputPath = path.join(this.inputPaths[0], inputFile);
        let fullOutputPath = path.join(outputDirectory, inputFile);

        // Compile into the outputDirectory
        fs.copyFileSync(fullInputPath, fullOutputPath);

        return {
          dependencies: [fullInputPath, "included.js"]
        }
      }
    );
  }
}
```

The file "foo.js" will be rebuilt using the callback whenever "foo.js" or
"included.js" change.

## Reference

* `class Multifilter`: A [Plugin](https://github.com/broccolijs/broccoli-plugin)
  subclass that implements a single `this.buildAndCache` helper method, which
  you should call from `build`.

  * `Multifilter.buildAndCache(inputFilePaths, callback)`: For each
    `inputFilePat`, call `callback` in sequence. This returns a promise, so be
    sure to `return` its return value from `build`.

    * `inputFilePaths`: An array of strings identifying input files.

      While you will typically use input file paths relative to
      `this.inputPaths[0]`, `Multifilter` makes no assumption about the
      meaning of these strings and simply treats them as opaque identifiers.

    * `callback(inputFilePath, outputDirectory)`: Your callback function to rebuild
      the file identified by `inputFilePath` and place the output file(s) into
      `outputDirectory`. It is important that you write into `outputDirectory` and
      *not* into `this.outputPath`.

      Every input file will get its own `outputDirectory`, which will be empty on
      each rebuild. After calling your callbacks for each `inputFilePath`,
      `buildAndCache` will merge the `outputDirectories` for all `inputFilePaths` into
      the plugin's output (`this.outputPath`), similar to
      [broccoli-merge-trees](https://github.com/broccolijs/broccoli-merge-trees)
      with `{ overwrite: false }`.

      The `callback` function must return an object (or a promise to an object) of
      the form

      ```js
      {
        dependencies: dependencyPaths
      }
      ```

      where `dependencyPaths` is an array of paths to each file or directory that
      the compilation for `inputFilePath` depends on.

      On rebuild, `buildAndCache` may re-use the output from the previous build
      instead of calling `callback`, provided that none of the files or directories
      (and their contents, recursively) identified by `dependencyPaths` have
      changed.

      You must include the main input file itself in `dependencyPaths`. Therefore,
      `dependencyPaths` must always be non-empty. For example, if each
      `inputFilePath` is the relative path to an input file (as is typical), you
      might return

      ```js
      {
        dependencies: [
          [path.join(this.inputPaths[0], inputFilePath)].concat(
            dependenciesReturnedByTheCompiler
          )
        ]
      }
      ```
