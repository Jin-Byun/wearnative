import fs from 'node:fs';
import type { BabelApi, BabelConfig, BabelConfigPlugin } from './types';

const env = process?.env;

export const withBabelPluginModuleResolver = (cnf?: any): BabelConfigPlugin => [
    require.resolve('babel-plugin-module-resolver'),
    {
        root: [env.RNV_MONO_ROOT || '.'],
        ...(cnf || {})
    }
];

const _withDefaultRNVBabel = (cnf: BabelConfig): BabelConfig => ({
    retainLines: true,
    presets: [['@babel/preset-env', {}]],
    plugins: [withBabelPluginModuleResolver()],
    ...cnf
});

export const withRNVBabel =
    (cnf: BabelConfig) =>
    (api: BabelApi): BabelConfig => {
        api.cache(true);
        if (env.RNV_ENGINE_PATH && !fs.existsSync(env.RNV_ENGINE_PATH)) {
            console.warn(`Path to engine cannot be resolved: ${env.RNV_ENGINE_PATH}. Will use default one`);
            api.cache(false);
            return _withDefaultRNVBabel(cnf);
        }
        return withBaseRNV(cnf, 'withRNVBabel');
    };

export const withRNVMetro = (cnf: unknown) => withBaseRNV(cnf, 'withRNVMetro');

export const withRNVRNConfig = (cnf: unknown) => withBaseRNV(cnf, 'withRNVRNConfig');

const withBaseRNV = (cnf: unknown, key: 'withRNVRNConfig' | 'withRNVMetro' | 'withRNVBabel') => {
    if (!env.RNV_ENGINE_PATH) return cnf;
    const engine = require(env.RNV_ENGINE_PATH);
    return engine[key]?.(cnf) || cnf;
};
