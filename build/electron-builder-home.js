// Local desktop fork: a separate app identity, with Frame's provider protocol intact.
const base = require('./electron-builder-base')
module.exports = {
  ...base,
  appId: 'com.openpond.local-wallet',
  productName: 'OpenPond Local Wallet',
  icon: 'resources/branding/openpond-wallet.png',
  directories: { output: 'dist/home' },
  artifactName: 'OpenPond-Local-Wallet-${version}-${os}-${arch}.${ext}',
  publish: null,
  linux: { executableName: 'openpond-local-wallet', category: 'Finance' }
}
