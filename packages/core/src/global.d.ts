import type { RnvApi, RnvContext } from '../src';

declare global {
    //eslint-disable-next-line no-var
    var RNV_CONTEXT: RnvContext;
    //eslint-disable-next-line no-var
    var RNV_API: RnvApi;
}

// biome-ignore lint/complexity/noUselessEmptyExport: Required by TypeScript for global augmentation
export {};
