var AdmZip = require('adm-zip');
var kew = require('kew');
var temp = require('temp');
var path = require('path');

function extractDownload(filePath) {
  var deferred = kew.defer();
  var extractedPath = temp.mkdirSync('selenium-chromedriver');

  console.log(extractedPath);
  var options = { cwd: extractedPath };

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

module.exports = extractDownload;
