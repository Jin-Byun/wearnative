import type { RnvPlatformName } from './enums/platformName';

export type RnvPlatformKey = keyof typeof RnvPlatformName;
export type RnvPlatform = RnvPlatformKey | null;
export type RenativeConfigVersion = string | { version: string };
export type Env = NodeJS.ProcessEnv;
