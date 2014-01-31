/**
 * Fetch the right version of Google Chrome's Selenium WebDriver for the
 * current platform.
 */

'use strict'

var AdmZip = require('adm-zip');
var cp = require('child_process');
var fs = require('fs');
var helper = require('./helper');
var kew = require('kew');
//var ncp = require('ncp');
//var mkdirp = require('mkdirp');
var path = require('path');
//var rimraf = require('rimraf').sync;
var which = require('which');
var temp = require("temp");
temp.track();

var requestBinary = require('./request-binary');

var domain = 'http://chromedriver.storage.googleapis.com/';

var originalPath = process.env.PATH;

// NPM adds bin directories to the path, which will cause `which` to find the
// bin for this package not the actual phantomjs bin.  Also help out people who
// put ./bin on their path
process.env.PATH = helper.cleanPath(originalPath);

var libPath = path.join(__dirname, 'lib');
var pkgPath = path.join(libPath, 'phantom');
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

function getDownloadUrl(process) {
  var url = 'chromedriver_';
  // Can't use a global version so start a download.
  if (process.platform === 'linux') {
    url += 'linux';
    if (process.arch === 'x64') {
      url += '64';
    } else {
      url += '32';
    }
  } else if (process.platform === 'darwin' || process.platform === 'openbsd' || process.platform === 'freebsd') {
    url += 'mac32';
  } else if (process.platform === 'win32') {
    url += 'win32'
  } else {
    console.error('Unexpected platform or architecture.');
    console.error('  Platform:\t' + process.platform);
    console.error(  'Architecture:\t' + process.arch);
    exit(1);
  }

  url += '.zip';

  return url;
}

var whichDeferred = kew.defer();
which('chromedriver', whichDeferred.makeNodeResolver());
whichDeferred.promise
  .then(getInstalledVersion)
  .then(function (stats) {
    var version = stats.version;
    var path = stats.path;

    if (helper.version == version) {
      writeLocationFile(driverPath);
      console.log('PhantomJS is already installed at ' + path + '.');
      exit(0);
    } else {
      console.log('PhantomJS detected, but wrong version ', version, '@', path + '.');
      throw new Error('Wrong version');
    }
  })
  .fail(function (err) {
    // Trying to use a globally-installed file failed, so initiate download and
    // install steps instead.
    var tempDir = temp.mkdirSync('selenium-chromedriver');
    var downloadUrl = domain + '2.8/' + getDownloadUrl(process);
    var fileName = 'chromedriver.zip';
    var absFileName = path.join(tempDir, fileName);

    // Start the install.
    console.log('Downloading', downloadUrl);
    console.log('Saving to', absFileName);
    return requestBinary(absFileName, downloadUrl);
  })
  .then(function (downloadedFile) {
    console.log(downloadedFile);
    return extractDownload(downloadedFile)
  });/*
  .then(function (extractedPath) {
    return copyIntoPlace(extractedPath, pkgPath)
  })
  .then(function () {
    var location = process.platform === 'win32' ?
        path.join(pkgPath, 'phantomjs.exe') :
        path.join(pkgPath, 'bin' ,'phantomjs')
    var relativeLocation = path.relative(libPath, location)
    writeLocationFile(relativeLocation)
    console.log('Done. Phantomjs binary available at', location)
    exit(0)
  })
  .fail(function (err) {
    console.error('Phantom installation failed', err, err.stack)
    exit(1)
  })


function writeLocationFile(location) {
  console.log('Writing location.js file')
  if (process.platform === 'win32') {
    location = location.replace(/\\/g, '\\\\')
  }
  fs.writeFileSync(path.join(libPath, 'location.js'),
      'module.exports.location = "' + location + '"')
}


function exit(code) {
  process.env.PATH = originalPath
  process.exit(code || 0)
}

function extractDownload(filePath) {
  var deferred = kew.defer()
  // extract to a unique directory in case multiple processes are
  // installing and extracting at once
  var extractedPath = filePath + '-extract-' + Date.now()
  var options = {cwd: extractedPath}

  mkdirp.sync(extractedPath, '0777')
  // Make double sure we have 0777 permissions; some operating systems
  // default umask does not allow write by default.
  fs.chmodSync(extractedPath, '0777')

  if (filePath.substr(-4) === '.zip') {
    console.log('Extracting zip contents')

    try {
      var zip = new AdmZip(filePath)
      zip.extractAllTo(extractedPath, true)
      deferred.resolve(extractedPath)
    } catch (err) {
      console.error('Error extracting archive')
      deferred.reject(err)
    }

  } else {
    console.log('Extracting tar contents (via spawned process)')
    cp.execFile('tar', ['jxf', filePath], options, function (err, stdout, stderr) {
      if (err) {
        console.error('Error extracting archive')
        deferred.reject(err)
      } else {
        deferred.resolve(extractedPath)
      }
    })
  }
  return deferred.promise
}


function copyIntoPlace(extractedPath, targetPath) {
  rimraf(targetPath)

  var deferred = kew.defer()
  // Look for the extracted directory, so we can rename it.
  var files = fs.readdirSync(extractedPath)
  for (var i = 0; i < files.length; i++) {
    var file = path.join(extractedPath, files[i])
    if (fs.statSync(file).isDirectory() && file.indexOf(helper.version) != -1) {
      console.log('Copying extracted folder', file, '->', targetPath)
      ncp(file, targetPath, deferred.makeNodeResolver())
      break
    }
  }

  // Cleanup extracted directory after it's been copied
  return deferred.promise.then(function() {
    try {
      return rimraf(extractedPath)
    } catch (e) {
      console.warn('Unable to remove temporary files at "' + extractedPath +
          '", see https://github.com/Obvious/phantomjs/issues/108 for details.')
    }
  });
}*/
