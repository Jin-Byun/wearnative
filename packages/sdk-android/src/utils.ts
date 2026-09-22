import path from 'node:path';
import {
    type ConfigFileBuildConfig,
    type ConfigProp,
    type ConfigPropKey,
    getAppFolder,
    getConfigProp,
    type OverridesOptions,
    type RnvContext,
    writeCleanFile
} from '@rnv/core';
import { getBuildFilePath } from '@rnv/sdk-utils';

export const getConfigPropArray = <T extends ConfigPropKey>(c: RnvContext, key: T) => {
    const result: Array<ConfigProp[T]> = [
        c.files.dotRnv.config,
        c.files.rnvConfigTemplates.config,
        c.files.workspace.config,
        c.files.workspace.configPrivate,
        c.files.workspace.configLocal,
        c.files.workspace.project.config,
        c.files.workspace.project.configPrivate,
        c.files.workspace.project.configLocal,
        c.files.project.config,
        c.files.project.configPrivate,
        c.files.project.configLocal
    ]
        .concat(
            c.files.workspace.appConfig.configs,
            c.files.workspace.appConfig.configsPrivate,
            c.files.workspace.appConfig.configsLocal,
            c.files.appConfig.configs,
            c.files.appConfig.configsPrivate,
            c.files.appConfig.configsLocal
        )
        .flatMap((config) => (config ? getConfigProp(key, config as ConfigFileBuildConfig) || [] : []));

    return result;
};

export const writeParsedFiles = (srcPath: string, injects: OverridesOptions, c: RnvContext, tmpPath?: string) => {
    const buildFilePath = getBuildFilePath(srcPath, tmpPath);
    const appFolder = getAppFolder();
    const filePath = path.join(appFolder, srcPath);
    writeCleanFile(buildFilePath, filePath, injects, undefined, c);
};

export const createOverridesOption = (
    pattern: string,
    override: string | number | undefined
): OverridesOptions[number] => ({
    pattern,
    override
});
