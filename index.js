var fs = require('fs');
var path = require('path');
var locationFile = path.join(__dirname, 'location.txt');
var relativeLocation;

exports.version = '~2.8.0';

if (!fs.existsSync(locationFile)) {
  exports.path = null;
  return;
}

relativeLocation = fs.readFileSync(locationFile, { encoding: 'utf8' });
exports.path = path.resolve(__dirname, relativeLocation);

// Make sure the binary is executable. For some reason doing this inside
// install does not work correctly, likely due to some NPM step.
try {
  // avoid touching the binary if it's already got the correct permissions
  var st = fs.statSync(exports.path);
  var mode = st.mode | 0555;
  if (mode !== st.mode) {
    fs.chmodSync(exports.path, mode);
  }
} catch (e) {
  // Just ignore error if we don't have permission. We did our best. Likely
  // because the chromedriver was already installed.
}
