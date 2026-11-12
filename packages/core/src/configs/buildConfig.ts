import path from 'node:path';
import merge from 'deepmerge';
import { getContext } from '../context/provider';
import type { RnvContext, RnvContextBuildConfig } from '../context/types';
import { chalk, logDebug, logDefault, logWarning } from '../logger';
import {
    formatBytes,
    fsExistsSync,
    fsMkdirSync,
    sanitizeDynamicProps,
    sanitizeDynamicRefs,
    writeFileSync
} from '../system/fs';
import type { FileUtilsPropConfig } from '../system/types';
import type { RnvPlatformKey } from '../types';

const _arrayMergeOverride = (_destinationArray: Array<string>, sourceArray: Array<string>) => sourceArray;

const getEnginesPluginDelta = () => {
    logDebug('getEnginesPluginDelta');
    const c = getContext();

    if (!c.buildConfig) return;

    c.runtime.missingEnginePlugins = {};

    const engineConfig = c.platform ? c.runtime.enginesByPlatform[c.platform]?.config : undefined;
    if (!engineConfig?.plugins) return {};
    if (!engineConfig?.plugins) return {};

    const enginePlugins: Record<string, string> = {};
    for (const pluginKey of Object.keys(engineConfig.plugins)) {
        if (engineConfig.plugins[pluginKey]) {
            if (!c.files?.project?.config?.plugins?.[pluginKey]) {
                c.runtime.missingEnginePlugins[pluginKey] = engineConfig.plugins[pluginKey];
            }
            enginePlugins[pluginKey] = engineConfig.plugins[pluginKey];
        }
    }
    return enginePlugins;
};

export const generateBuildConfig = () => {
    logDebug('generateBuildConfig');

    const c = getContext();
    const extraPlugins = getEnginesPluginDelta();

    const mergePaths = [
        c.paths.rnvConfigTemplates.config,
        c.paths.workspace.config,
        c.paths.workspace.configLocal,
        c.paths.workspace.configPrivate,
        c.paths.workspace.project.config,
        c.paths.workspace.project.configLocal,
        c.paths.workspace.project.configPrivate,
        c.paths.project.config,
        c.paths.project.configLocal,
        c.paths.project.configPrivate
    ].concat(
        c.paths.workspace.appConfig.configs,
        c.paths.workspace.appConfig.configsLocal,
        c.paths.workspace.appConfig.configsPrivate,
        c.paths.appConfig.configs,
        c.paths.appConfig.configsLocal,
        c.paths.appConfig.configsPrivate
    );

    const mergeFiles = [
        { plugins: extraPlugins },
        c.files.rnvConfigTemplates.config,
        c.files.workspace.config,
        c.files.workspace.configLocal,
        c.files.workspace.configPrivate,
        c.files.workspace.project.config,
        c.files.workspace.project.configLocal,
        c.files.workspace.project.configPrivate,
        c.files.project.config,
        c.files.project.configLocal,
        c.files.project.configPrivate
    ].concat(
        c.files.workspace.appConfig.configs,
        c.files.workspace.appConfig.configsLocal,
        c.files.workspace.appConfig.configsPrivate,
        c.files.appConfig.configs,
        c.files.appConfig.configsLocal,
        c.files.appConfig.configsPrivate
    );

    _generateBuildConfig(mergePaths, mergeFiles);
};

const _generateBuildConfig = (mergePaths: string[], mergeFiles: Array<object | undefined>) => {
    const c = getContext();
    const existsPaths = mergePaths.flatMap((v) => {
        if (!v || !fsExistsSync(v)) return [];
        logDebug(`Merged: ${v}`);
        return v;
    });

    const scopedPluginTemplates = Object.entries(c.files.scopedConfigTemplates ?? {}).reduce(
        (acc, [k, v]) => {
            acc[k] = v.pluginTemplates;
            return acc;
        },
        {} as Record<string, any>
    );

    const meta = {
        _meta: {
            generated: Date.now(),
            mergedConfigs: existsPaths
        }
    };
    const existsFiles: object[] = mergeFiles.filter((v) => v !== undefined);

    logDebug(
        `generateBuildConfig:mergeOrder.length:${mergePaths.length},existsPaths.length:${existsPaths.length},existsFiles.length:${existsFiles.length}`
    );

    const out: RnvContextBuildConfig = merge(
        {},
        merge.all<RnvContextBuildConfig>([meta, ...existsFiles], {
            arrayMerge: _arrayMergeOverride
        })
    );
    out.scopedPluginTemplates = scopedPluginTemplates;

    c.buildConfig = sanitizeDynamicRefs<RnvContextBuildConfig>(c, out);
    const propConfig: FileUtilsPropConfig = {
        files: c.files,
        runtimeProps: c.runtime,
        props: c.buildConfig._refs || {},
        configProps: c.configPropsInjects
    };
    c.buildConfig = sanitizeDynamicProps(c.buildConfig, propConfig);

    //Merge extendPlatform
    if (c.buildConfig.platforms) {
        const { platforms } = c.buildConfig;
        Object.entries(platforms).forEach(([k, plat]) => {
            if (plat?.extendPlatform) {
                const extPlat = platforms[plat.extendPlatform];
                if (extPlat) {
                    platforms[k as RnvPlatformKey] = merge(extPlat, plat);
                }
            }
        });
    }

    logDebug('BUILD_CONFIG', Object.keys(c.buildConfig));

    if (c.runtime.appId) {
        c.paths.project.builds.config = path.join(c.paths.project.builds.dir, `${c.runtime.appId}_${c.platform}.json`);

        logDebug(`generateBuildConfig: will sanitize file at: ${c.paths.project.builds.config}`);

        if (c.paths.project.builds.dir) {
            fsMkdirSync(c.paths.project.builds.dir, { recursive: true });
            const result = writeFileSync(c.paths.project.builds.config, c.buildConfig);
            if (result) {
                const size = formatBytes(Buffer.byteLength(result, 'utf8'));
                logDefault(chalk.grey('generateBuildConfig'), `size:${size}`);
            } else {
                logDebug(`generateBuildConfig NOT SAVED: ${c.paths.project.builds.config}`);
            }
        } else {
            logWarning('Cannot save buildConfig as c.paths.project.builds.dir is not defined');
        }
    }

    _checkEngineOverride(c);
};

const _checkEngineOverride = (c: RnvContext) => {
    const { scheme, engine } = c.program.opts();
    if (!c.platform || !scheme || !engine) return;

    const platform = c.buildConfig.platforms?.[c.platform];
    if (!platform) return;

    const definedEngine = platform.buildSchemes?.[scheme]?.engine || engine;
    if (definedEngine) {
        platform.engine = definedEngine;
    }
};
