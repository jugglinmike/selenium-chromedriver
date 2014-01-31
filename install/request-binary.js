var kew = require('kew');
var http = require('http');
var fs = require('fs');
var url = require('url');
var util = require('util');

var npmconf = require('npmconf');

function requestBinary(filePath, downloadUrl) {
  var deferred = kew.defer();
  npmconf.load(function(err, conf) {
    var requestOptions = getRequestOptions(conf.get('proxy'), downloadUrl);
    var count = 0
    var notifiedCount = 0
    var writePath = filePath + '-download-' + Date.now()
    var outFile = fs.openSync(writePath, 'w')

    var client = http.get(requestOptions, function (response) {
      var status = response.statusCode
      console.log('Receiving...')

      if (status === 200) {
        response.addListener('data',   function (data) {
          fs.writeSync(outFile, data, 0, data.length, null)
          count += data.length
          if ((count - notifiedCount) > 800000) {
            console.log('Received ' + Math.floor(count / 1024) + 'K...')
            notifiedCount = count
          }
        })

        response.addListener('end',   function () {
          console.log('Received ' + Math.floor(count / 1024) + 'K total.')
          fs.closeSync(outFile)
          fs.renameSync(writePath, filePath)
          deferred.resolve(filePath)
        })

      } else {
        client.abort()
        console.error('Error requesting archive')
        deferred.reject(new Error('Error with http request: ' + util.inspect(response.headers)))
      }
    });

  });

  return deferred.promise
}

function getRequestOptions(proxyUrl, downloadUrl) {
  if (proxyUrl) {
    var options = url.parse(proxyUrl);
    options.path = downloadUrl;
    options.headers = {
      Host: url.parse(downloadUrl).host
    };
    // If going through proxy, spoof the User-Agent, since may commerical
    // proxies block blank or unknown agents in headers
    options.headers['User-Agent'] = 'curl/7.21.4 (universal-apple-darwin11.0) libcurl/7.21.4 OpenSSL/0.9.8r zlib/1.2.5'
    // Turn basic authorization into proxy-authorization.
    if (options.auth) {
      options.headers['Proxy-Authorization'] = 'Basic ' + new Buffer(options.auth).toString('base64')
      delete options.auth
    }

    return options;
  } else {
    return url.parse(downloadUrl)
  }
}

module.exports = requestBinary;
