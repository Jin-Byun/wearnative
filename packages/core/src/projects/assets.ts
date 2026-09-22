import path from 'path';
import { getConfigProp, getPlatformProjectDir, getTimestampPathsConfig } from '../context/contextProps';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { chalk, logDebug, logDefault, logInfo, logWarning } from '../logger';
import { cleanFolder, copyFolderContentsRecursiveSync, fsExistsSync, mkdirSync } from '../system/fs';
import type { RnvPlatform } from '../types';
import { resolveRelativePackage } from './utils';

export const copyRuntimeAssets = async () => {
    logDefault('copyRuntimeAssets');
    const c = getContext();
    const destPath = path.join(c.paths.project.assets.dir, 'runtime');

    // FOLDER MERGERS FROM APP CONFIG + EXTEND
    if (c.paths.appConfig.dirs) {
        c.paths.appConfig.dirs.forEach((v) => {
            const sourcePath = path.join(v, 'assets/runtime');
            copyFolderContentsRecursiveSync(sourcePath, destPath);
        });
    } else if (c.paths.appConfig.dir) {
        const sourcePath = path.join(c.paths.appConfig.dir, 'assets/runtime');
        copyFolderContentsRecursiveSync(sourcePath, destPath);
    }

    if (!c.buildConfig?.common) {
        logDebug('BUILD_CONFIG', c.buildConfig);
        logWarning(
            `Your ${chalk.bold.white(
                c.paths.appConfig.config
            )} is misconfigured. (Maybe you have older version?). Missing ${chalk.bold.white(
                '{ common: {} }'
            )} object at root`
        );

        return true;
    }

    return true;
};

// Copies assets from available sources for a platform
// destPath - can be either absolute or relative to platformBuilds/*_platform dir,
// default is platformBuilds/*_platform dir absolute path
export const copyAssetsFolder = (destPath?: string, customFn?: (c: RnvContext, platform: RnvPlatform) => void) => {
    logDefault('copyAssetsFolder');

    const c = getContext();
    const { platform } = c;
    const tsPathsConfig = getTimestampPathsConfig();
    const assetSources: string[] = getConfigProp('assetSources') || [];
    const assetFolderPlatform = getConfigProp('assetFolderPlatform') || platform;

    if (assetFolderPlatform !== platform) {
        logInfo(
            `Found custom assetFolderPlatform: ${chalk.green(
                assetFolderPlatform
            )}. Will use it instead of default ${platform}`
        );
    }

    const validAssetSources: Array<string> =
        (assetFolderPlatform &&
            assetSources.flatMap((v) => {
                const assetsPath = path.join(resolveRelativePackage(c, v), assetFolderPlatform);
                if (fsExistsSync(assetsPath)) {
                    return assetsPath;
                }
                logWarning(
                    `AssetSources is specified as ${chalk.red(v)}. But path ${chalk.red(assetsPath)} was not found.`
                );
                return [];
            })) ||
        [];
    const hasExternalAssets = !!validAssetSources.length;

    const destinationPath =
        destPath && path.isAbsolute(destPath) ? destPath : path.join(getPlatformProjectDir() as string, destPath || '');
    // FOLDER MERGERS FROM EXTERNAL SOURCES
    if (hasExternalAssets) {
        logInfo(
            `Found custom assetSources at ${chalk.gray(validAssetSources.join('/n'))}. Will be used to generate assets.`
        );
        validAssetSources.forEach((sourcePath) => {
            copyFolderContentsRecursiveSync(
                sourcePath,
                destinationPath,
                true,
                undefined,
                false,
                undefined,
                tsPathsConfig,
                c
            );
        });
    }

    // FOLDER MERGERS FROM APP CONFIG + EXTEND
    if (c.paths.appConfig.dirs) {
        const hasAssetFolder = c.paths.appConfig.dirs.filter((v) =>
            fsExistsSync(path.join(v, `assets/${assetFolderPlatform}`))
        ).length;
        if (!hasAssetFolder && !hasExternalAssets) {
            logWarning(`Your app is missing assets at ${chalk.red(c.paths.appConfig.dirs.join(','))}.`);
        }
    } else {
        const sourcePath = path.join(c.paths.appConfig.dir, `assets/${assetFolderPlatform}`);
        if (!fsExistsSync(sourcePath) && !hasExternalAssets) {
            logWarning(`Your app is missing assets at ${chalk.red(sourcePath)}.`);
        }
    }

    if (customFn) {
        return customFn(c, platform);
    }

    // FOLDER MERGERS FROM APP CONFIG + EXTEND
    if (c.paths.appConfig.dirs) {
        c.paths.appConfig.dirs.forEach((v) => {
            const sourcePath = path.join(v, `assets/${assetFolderPlatform}`);
            copyFolderContentsRecursiveSync(
                sourcePath,
                destinationPath,
                true,
                undefined,
                false,
                undefined,
                tsPathsConfig,
                c
            );
        });
    } else {
        const sourcePath = path.join(c.paths.appConfig.dir, `assets/${assetFolderPlatform}`);
        copyFolderContentsRecursiveSync(
            sourcePath,
            destinationPath,
            true,
            undefined,
            false,
            undefined,
            tsPathsConfig,
            c
        );
    }
};

export const cleanPlaformAssets = async () => {
    const c = getContext();
    logDefault('cleanPlaformAssets');

    await cleanFolder(c.paths.project.assets.dir);
    mkdirSync(c.paths.project.assets.runtimeDir);
    return true;
};
