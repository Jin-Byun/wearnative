import engine from './api/engine';
import factor from './api/factor';
import platform from './api/platform';
import { Engine, FormFactor, Platform } from './constants';

// PLATFORM
export const isPlatformAndroid = platform === Platform.android;
export const isPlatformAndroidwear = platform === Platform.androidwear;
export const isPlatformIos = platform === Platform.ios;
export const isPlatformMacos = platform === Platform.macos;
export const isPlatformWindows = platform === Platform.windows;
export const isPlatformLinux = platform === Platform.linux;

// FACTOR
export const isFactorMobile = factor === FormFactor.mobile;
export const isFactorWatch = factor === FormFactor.watch;

export const isEngineRn = engine === Engine.rn;

export const isMobile = () => factor === FormFactor.mobile;
export const isWatch = () => factor === FormFactor.watch;

export const isAndroid = () => platform === Platform.android;
export const isAndroidwear = () => platform === Platform.androidwear;
export const isMacos = () => platform === Platform.macos;
export const isIos = () => platform === Platform.ios;
