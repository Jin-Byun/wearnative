import path from 'node:path';
import { type Env, fsExistsSync } from '@rnv/core';
import { type InputConfig, mergeConfig, withMetroConfig } from '@rnv/sdk-react-native';

const sharedExclusions = [
    /node_modules\/react\/dist\/.*/,
    /website\/node_modules\/.*/,
    /heapCapture\/bundle\.js/,
    /.*\/__tests__\/.*/
];

const env: Env = process?.env;

function escapeRegExp(pattern: RegExp | string) {
    if (typeof pattern === 'string') {
        const escaped = pattern.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&'); // convert the '/' into an escaped local file separator
        return escaped.replace(/\//g, `\\${path.sep}`);
    }
    if (Object.prototype.toString.call(pattern) === '[object RegExp]') {
        return pattern.source.replace(/\//g, path.sep);
    }
    throw new Error(`Unexpected exclusion pattern: ${pattern}`);
}

function exclusionList(additionalExclusions: RegExp[]) {
    return [...additionalExclusions, ...sharedExclusions].map((regexp) => new RegExp(escapeRegExp(regexp)));
}

export const withRNVMetro = (config: InputConfig): InputConfig => {
    const projectPath = env.RNV_PROJECT_ROOT || process.cwd();

    const defaultConfig = withMetroConfig(projectPath);
    const projectNodeModulesPath = path.resolve(projectPath, 'node_modules');
    const watchFolders = fsExistsSync(projectNodeModulesPath) ? [projectNodeModulesPath] : [];

    if (env.RNV_IS_MONOREPO) {
        const monoRootPath = env.RNV_MONO_ROOT || projectPath;
        watchFolders.push(path.resolve(monoRootPath, 'node_modules'));
        watchFolders.push(path.resolve(monoRootPath, 'packages'));
    }
    if (config?.watchFolders?.length) {
        watchFolders.push(...config.watchFolders);
    }

    const exts: string = env.RNV_EXTENSIONS || '';

    const cnfRnv: InputConfig = {
        transformer: {
            getTransformOptions: async (entryPoints, options, getDependenciesOf) => {
                const transformOptions =
                    (await config?.transformer?.getTransformOptions?.(entryPoints, options, getDependenciesOf)) || {};

                return {
                    ...transformOptions,
                    transform: {
                        experimentalImportSupport: false,
                        // this defeats the RCTDeviceEventEmitter is not a registered callable module
                        inlineRequires: true,
                        ...(transformOptions?.transform || {})
                    }
                };
            }
        },
        resolver: {
            blockList: exclusionList(
                [
                    /platformBuilds\/.*/,
                    /buildHooks\/.*/,
                    /projectConfig\/.*/,
                    /website\/.*/,
                    /appConfigs\/.*/,
                    /renative.local.*/,
                    /metro.config.local.*/,
                    /.expo\/.*/,
                    /.rollup.cache\/.*/
                ]
                    .concat(config?.resolver?.blockList || [])
                    .concat(config?.resolver?.blacklistRE || [])
            ),
            blacklistRE: undefined, // must be reset to prevent it from being processed by metro
            sourceExts: [...(config?.resolver?.sourceExts || []), ...exts.split(',')]
        },
        watchFolders,
        projectRoot: config?.projectRoot || path.resolve(projectPath)
    };

    const cnf = mergeConfig(defaultConfig, config, cnfRnv);
    return cnf;
};
