import { getConsoleFunction, setConsoleFunction } from "three/src/Three.js";

export * from "three/src/Three.js";

const threeClockDeprecationWarning = "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.";

installThreeClockWarningFilter();

function installThreeClockWarningFilter() {
  const globalScope = globalThis as typeof globalThis & {
    __spaceShooterThreeClockWarningFilterInstalled?: boolean;
  };

  if (globalScope.__spaceShooterThreeClockWarningFilterInstalled) return;
  globalScope.__spaceShooterThreeClockWarningFilterInstalled = true;

  const previousConsoleFunction = getConsoleFunction();

  setConsoleFunction((type, message, ...params) => {
    if (type === "warn" && message === threeClockDeprecationWarning) return;

    if (previousConsoleFunction) {
      previousConsoleFunction(type, message, ...params);
      return;
    }

    console[type](message, ...params);
  });
}
