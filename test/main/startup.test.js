import fs from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'

test('selects the requested profile before loading application modules', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/index.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  })
  const env = { FRAME_HOME_USER_DATA: '/tmp/frame-startup-test-profile' }
  let profile = '/tmp/default-electron-profile'
  let profileAtImport
  let bundleAtImport
  const stop = new Error('Stop before loading application modules')
  const context = {
    exports: {},
    __dirname: path.resolve(__dirname, '../../compiled/main'),
    process: { env },
    require: (id) => {
      if (id === 'electron')
        return {
          app: {
            setPath: (name, value) => {
              if (name === 'userData') profile = value
            }
          }
        }
      if (id === 'path') return path
      if (id === 'url' || id === 'electron-log') return {}
      profileAtImport = profile
      bundleAtImport = env.BUNDLE_LOCATION
      throw stop
    }
  }
  expect(() => vm.runInNewContext(outputText, context)).toThrow(stop)
  expect(profileAtImport).toBe(env.FRAME_HOME_USER_DATA)
  expect(bundleAtImport).toBe(path.resolve(__dirname, '../../bundle'))
})
