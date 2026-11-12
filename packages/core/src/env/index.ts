import path from 'node:path';
import { getAppFolder, getConfigRootProp } from '../context/contextProps';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { getRelativePath } from '../system/fs';
import type { RnvEnvContext } from './types';

export const CoreEnvVars = {
    RNV_EXTENSIONS: () => {
        const ctx = getContext();
        return { RNV_EXTENSIONS: _getPlatformExtensions(ctx) };
    },
    BASE: () => {
        const ctx = getContext();
        return _generateEnvVars(ctx);
    }
};

const _generateEnvVars = (c: RnvContext) => {
    const isMonorepo = getConfigRootProp('isMonorepo');
    const monoRoot = getConfigRootProp('monoRoot') || '../..';

    const envConfig: RnvEnvContext = {
        RNV_ENGINE_PATH: c.runtime.engine?.rootPath,
        RNV_PROJECT_ROOT: c.paths.project.dir,
        RNV_APP_BUILD_DIR: getRelativePath(c.paths.project.dir, getAppFolder()),
        RNV_IS_MONOREPO: isMonorepo,
        RNV_MONO_ROOT: isMonorepo ? path.join(c.paths.project.dir, monoRoot) : c.paths.project.dir,
        RNV_ENGINE: c.runtime.engine?.id,
        RNV_IS_NATIVE_TV: c.platform ? ['tvos', 'androidtv', 'firetv'].includes(c.platform) : false
    };

    return envConfig;
};

const _getPlatformExtensions = (c: RnvContext, excludeServer = false, addDotPrefix = false): Array<string> => {
    const { engine } = c.runtime;
    if (!engine || !c.platform) return [];
    const { platforms } = engine;
    const mapper = addDotPrefix ? (v: string) => `.${v}` : (v: string) => v;
    const extensions = platforms[c.platform]?.extensions;
    if (!extensions) return [];
    if (!excludeServer) return extensions.map(mapper);
    return extensions.filter((ext) => !ext.includes('server.')).map(mapper);
};
