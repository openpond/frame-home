// Local desktop fork: a separate app identity, with Frame's provider protocol intact.
const base = require('./electron-builder-base')
module.exports = {
  ...base,
  appId: 'local.frame.home',
  productName: 'Frame Home',
  directories: { output: 'dist/home' },
  artifactName: 'Frame-Home-${version}-${os}-${arch}.${ext}',
  publish: null,
  linux: { executableName: 'frame-home', category: 'Finance' }
}
