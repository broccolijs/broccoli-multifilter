'use strict';

let chai = require('chai');
let expect = chai.expect;
let chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
let fixture = require('broccoli-fixture');
let mkdirp = require('mkdirp');
let fs = require('fs');
let path = require('path');
let rimraf = require('rimraf');
let MultiFilter = require('./');

let fixturePath = path.join(process.cwd(), 'test-fixtures.tmp');

class TestMultiFilter extends MultiFilter {
  constructor() {
    super([fixturePath]);
    this.fail1 = false;
    this.fail2 = false;
  }

  build() {
    this.didRecompile1 = false;
    this.didRecompile2 = false;
    return this.buildAndCache(['compile1', 'compile2'], function (token, outputDirectoryPath) {
      return this[token].call(this, outputDirectoryPath);
    });
  }

  compile1(outputDirectoryPath) {
    this.didRecompile1 = true;
    if (this.fail1) throw new Error('fail1');
    fs.writeFileSync(outputDirectoryPath + '/out1.txt', 'out1');
    return [
      this.inputPaths[0] + '/in1.txt',
      this.inputPaths[0] + '/dep1.txt'
    ];
  }

  compile2(outputDirectoryPath) {
    this.didRecompile2 = true;
    if (this.fail2) throw new Error('fail2');
    fs.writeFileSync(outputDirectoryPath + '/out2.txt', 'out2');
    return [
      this.inputPaths[0] + '/in2.txt',
      this.inputPaths[0] + '/dep2a.txt',
      this.inputPaths[0] + '/dep2b',
      this.inputPaths[0] + '/dep2c'
    ];
  }
}

describe('MultiFilter', () => {
  let builder;
  let node;
  let fileContents;
  let expectedResult;

  beforeEach(() => {
    fileContents = 'x';
    rimraf.sync(fixturePath);
    fs.mkdirSync(fixturePath);
    touchFile('in1.txt');
    touchFile('dep1.txt');
    touchFile('in2.txt');
    touchFile('dep2a.txt');
    touchFile('dep2b/file1.txt');
    expectedResult = {
      'out1.txt': 'out1',
      'out2.txt': 'out2'
    };
    node = new TestMultiFilter();
    builder = new fixture.Builder(node);
  });

  function touchFile(relativePath) {
    let absolutePath = fixturePath + '/' + relativePath;
    mkdirp.sync(path.dirname(absolutePath));
    fs.writeFileSync(absolutePath, fileContents);
    fileContents += 'x';
  }

  function rebuild() {
    let resultPromise = builder.build();
    return expect(resultPromise).to.eventually.deep.equal(expectedResult);
  }

  function expectRecompile(shouldRecompile1, shouldRecompile2) {
    expect(node.didRecompile1).to.equal(shouldRecompile1, 'didRecompile1');
    expect(node.didRecompile2).to.equal(shouldRecompile2, 'didRecompile2');
  }

  afterEach(() => {
    builder.cleanup();
    rimraf.sync(fixturePath);
  });

  it('builds initially', () => {
    return rebuild().then(() => {
      expectRecompile(true, true);
    });
  });

  describe('rebuild', () => {
    beforeEach(() => {
      return rebuild().then(() => {
        expectRecompile(true, true);
      });
    });

    it('does not rebuild when no dependency changes', () => {
      return rebuild().then(() => {
        expectRecompile(false, false);
      });
    });

    it('rebuilds when a file is changed', () => {
      touchFile('dep2a.txt');
      return rebuild().then(() => {
        expectRecompile(false, true);
      });
    });

    it('rebuilds when a file is removed', () => {
      fs.unlinkSync(fixturePath + '/dep2a.txt');
      return rebuild().then(() => {
        expectRecompile(false, true);
      });
    });

    it('rebuilds when a file is changed in a directory', () => {
      touchFile('dep2b/file2.txt');
      return rebuild().then(() => {
        expectRecompile(false, true);
      });
    });

    it('rebuilds when a directory is added', () => {
      fs.mkdirSync(fixturePath + '/dep2c');
      return rebuild().then(() => {
        expectRecompile(false, true);
      });
    });
  });

  describe('build failures', () => {
    it('stops building after first failure', () => {
      return Promise.resolve()
        .then(() => {
          node.fail1 = true;
          return expect(builder.build()).to.be.rejectedWith(/fail1/);
        })
        .then(() => {
          expectRecompile(true, false);

          node.fail1 = false;
          return rebuild();
        })
        .then(() => {
          expectRecompile(true, true);
        });
    });

    it('always rebuilds files that failed, and does not purge subsequent files from cache', () => {
      return Promise.resolve()
        .then(() => {
          return rebuild();
        })
        .then(() => {
          node.fail1 = true;
          touchFile('in1.txt');
          return expect(builder.build()).to.be.rejectedWith(/fail1/);
        })
        .then(() => {
          expectRecompile(true, false);

          node.fail1 = false;
          // No need to touch again -- we should always rebuild file 1.
          return rebuild();
        })
        .then(() => {
          expectRecompile(true, false);
        });
    });
  });

  describe('usage errors', () => {
    class FailingPlugin extends MultiFilter {
      constructor(tokens, cb) {
        super([fixturePath]);
        this.tokens = tokens;
        this.cb = cb;
      }

      build() {
        return this.buildAndCache(this.tokens, this.cb);
      }
    }

    describe('tokens (input files)', () => {
      it('requires tokens to be strings', () => {
        return expect(fixture.build(new FailingPlugin([null], () => { })))
          .to.be.rejectedWith(/Expected a string/);
      });

      it('rejects duplicate tokens', () => {
        return expect(fixture.build(new FailingPlugin(['foo.js', 'foo.js'], () => { })))
          .to.be.rejectedWith(/Duplicate input file/);
      });
    });

    describe('dependencies', () => {
      it('requires that dependencies is an array', () => {
        return expect(fixture.build(new FailingPlugin(['file.txt'], () => {
          return undefined;
        }))).to.be.rejectedWith(/must return an array/);
      });

      it('requires that the dependencies array is non-empty', () => {
        return expect(fixture.build(new FailingPlugin(['file.txt'], () => {
          return [];
        }))).to.be.rejectedWith(/least one dependency/);
      });

      it('requires that at least one dependency exists', () => {
        return expect(fixture.build(new FailingPlugin(['file.txt'], () => {
          return ['/does_not_exist'];
        }))).to.be.rejectedWith(/files exist/);
      });
    });
  });
});

require('mocha-eslint')('*.js');
