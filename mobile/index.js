import 'react-native-gesture-handler';

function installErrorLoggers() {
  const g = globalThis;
  try {
    const ErrorUtils = g.ErrorUtils;
    if (ErrorUtils?.getGlobalHandler && ErrorUtils?.setGlobalHandler) {
      const prev = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        console.error(
          '[karea] global error fatal=' + String(isFatal),
          error,
          error?.stack,
        );
        prev?.(error, isFatal);
      });
    }
  } catch (err) {
    console.error('[karea] failed to install ErrorUtils handler', err);
  }

  const onRejection = (reason) => {
    console.error('[karea] unhandled rejection', reason);
  };
  g.addEventListener?.('unhandledrejection', (ev) => {
    onRejection(ev?.reason ?? ev);
  });
}

installErrorLoggers();
console.info('[karea] bootstrap: importing App');

const { registerRootComponent } = require('expo');
const App = require('./App').default;

console.info('[karea] bootstrap: App imported, registering root');
registerRootComponent(App);
console.info('[karea] bootstrap: root registered');
