/**
 * Fetch the right version of Google Chrome's Selenium WebDriver for the
 * current platform.
 */

'use strict'

var cp = require('child_process');
var fs = require('fs');
var kew = require('kew');
//var ncp = require('ncp');
var mkdirp = require('mkdirp');
var path = require('path');
var which = require('which');
var semver = require('semver');
var temp = require("temp");
temp.track();

var requiredVersion = require('../').version;
var requestBinary = require('./request-binary');
var extract = require('./extract');

var binaryName = 'chromedriver';

if (process.platform === 'win32') {
  binaryName += '.exe';
}

// NPM adds bin directories to the path, which will cause `which` to find the
// bin for this package not the actual chromedriver bininary.  Also help out
// people who put ./bin on their path
var originalPath = process.env.PATH;
process.env.PATH = require('./util/clean-path')(originalPath);
process.addListener('exit', function() {
  process.env.PATH = originalPath;
});

var installDir = path.join(__dirname, '..', 'bin');
var libDir = __dirname;
var tmpPath = null;

function getInstalledVersion(path) {
  var versionRe = /\(v(\d+[\d\.]+\d)\)/;
  var obtainedVersion = false;
  var output = '';
  var versionDfd, child;

  // Horrible hack to avoid problems during global install. We check to see
  // if the file `which` found is our own bin script.
  // See: https://github.com/Obvious/phantomjs/issues/85
  if (/NPM_INSTALL_MARKER/.test(fs.readFileSync(path, 'utf8'))) {
    console.log('Looks like an `npm install -g`; ' +
      'unable to check for previously-installed version.'
    );
    throw new Error('Global install');
  }

  versionDfd = kew.defer();

  // The Chrome WebDriver binary does not currently implement any sort of
  // `version` command-line switch. It happens to print the current version
  // number immediately upon being executed, however.
  // Invoke the process and wait for a "version-like" string to be printed to
  // standard out (then kill the process).
  // TODO: Retrieve the version string more cleanly when the necessary switch
  // is implemented:
  // "Issue 152:  Support --version switch"
  // https://code.google.com/p/chromedriver/issues/detail?id=152
  child = cp.execFile(path, function(err) {
    // If the child process exits before the version number has been read, then
    // this operation has failed (regardless of how the process exited).
    if (!obtainedVersion) {
      versionDfd.reject(err);
    }
  });

  function onData(chunk) {
    output += chunk;
    var match = output.match(versionRe);
    if (match) {
      obtainedVersion = true;
      child.stdout.removeListener('data', onData);
      versionDfd.resolve({ path: path, version: match[1] });
      child.kill();
    }
  }

  child.stdout.on('data', onData);

  return versionDfd.promise;
}

function getDownloadUrl(process, version) {
  var domain = 'http://chromedriver.storage.googleapis.com';
  var fileName = 'chromedriver_';
  var extension = 'zip';
  var platform = process.platform;
  var arch = process.arch;
  var versionDir = version.match(/^~(\d+.\d+)/)[1];

  // Can't use a global version so start a download.
  if (platform === 'linux') {
    fileName += 'linux';
    if (arch === 'x64') {
      fileName += '64';
    } else {
      fileName += '32';
    }
  } else if (platform === 'darwin' || platform === 'openbsd' || platform === 'freebsd') {
    fileName += 'mac32';
  } else if (platform === 'win32') {
    fileName += 'win32'
  } else {
    console.error('Unexpected platform or architecture.');
    console.error('  Platform:\t' + platform);
    console.error('  Architecture:\t' + arch);
    process.exit(1);
  }

  return domain + '/' + versionDir + '/' + fileName + '.' + extension;
}

var whichDeferred = kew.defer();
which('chromedriver', whichDeferred.makeNodeResolver());
whichDeferred.promise
  .then(getInstalledVersion)
  .then(function (stats) {
    var version = stats.version;
    var path = stats.path;

    if (semver.satisfies(version, requiredVersion)) {
      writeLocationFile(path);
      console.log('chromedriver is already installed at ' + path + '.');
      process.exit(0);
    } else {
      console.log('chromedriver detected, but wrong version ', version, '@', path + '.');
      throw new Error('Wrong version');
    }
  })
  .fail(function (err) {
    // Trying to use a globally-installed file failed, so initiate download and
    // install steps instead.
    var tempDir = temp.mkdirSync('selenium-chromedriver');
    var downloadUrl = getDownloadUrl(process, requiredVersion);
    var fileName = 'chromedriver.zip';
    var absFileName = path.join(tempDir, fileName);

    // Start the install.
    console.log('Downloading', downloadUrl);
    console.log('Saving to', absFileName);
    return requestBinary(absFileName, downloadUrl);
  })
  .then(function (downloadedFileName) {
    return extract(downloadedFileName)
  })
  .then(function (extractedPath) {
    return copyIntoPlace(extractedPath, installDir);
  })
  .then(function () {
    var location = path.join(installDir, binaryName);

    var relativeLocation = path.relative(path.join(__dirname, '..'), location)
    writeLocationFile(relativeLocation)
    console.log('Done. chromedriver binary available at', location)
    process.exit(0)
  })
  .fail(function (err) {
    console.error('chromedriver installation failed', err, err.stack)
    process.exit(1)
  })


function writeLocationFile(location) {
  console.log('Writing location.txt file')
  if (process.platform === 'win32') {
    location = location.replace(/\\/g, '\\\\')
  }
  fs.writeFileSync(path.join(__dirname, '..', 'location.txt'), location);
}

function copyIntoPlace(extractedPath, targetDir) {
  var dfd = kew.defer();

  mkdirp.sync(targetDir);

  // Look for the extracted directory, so we can rename it.
  fs.readdirSync(extractedPath).forEach(function(fileName) {
    if (fileName !== binaryName) {
      return;
    }
    var absFileName = path.join(extractedPath, fileName);

    fs.rename(absFileName, path.join(targetDir, fileName), function(err) {
      if (err) {
        dfd.reject(err);
      } else {
        dfd.resolve();
      }
    });
  });

  return dfd.promise;
}
