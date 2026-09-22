import path from 'path';
import { chalk, logError, logWarning } from '../logger';
import type {
    BuildConfigKey,
    CommonBuildSchemeKey,
    CommonPropKey,
    ConfigCommonBuildSchemeSchema,
    ConfigFileBuildConfig,
    ConfigPropKeyMerged,
    ConfigPropRootKeyMerged,
    GetConfigPropVal,
    GetConfigRootPropVal,
    PlatformBuildSchemeKey
} from '../schema/types';
import { fsExistsSync } from '../system/fs';
import type { TimestampPathsConfig } from '../system/types';
import { getContext } from './provider';

const _getValueOrMergedObject = (
    resultScheme: object | undefined,
    resultPlatforms: object | undefined,
    resultCommon: object
) => {
    const target = resultScheme ?? resultPlatforms;
    if (target === null) return undefined;
    if (target === undefined) return resultCommon;
    if (Array.isArray(target) || typeof target !== 'object') return target;
    return Object.assign(resultCommon || {}, resultPlatforms, resultScheme);
};

export const getConfigRootProp = <T, K extends ConfigPropRootKeyMerged<T>>(key: K): GetConfigRootPropVal<T, K> => {
    const c = getContext();
    if (!c.buildConfig) {
        logError('getConfigProp: c.buildConfig is undefined!');
        return;
    }
    return c.buildConfig[key];
};

export const getConfigProp = <T, K extends ConfigPropKeyMerged<T>>(
    key: K,
    obj?: Partial<ConfigFileBuildConfig>
): GetConfigPropVal<T, K> => {
    const c = getContext();
    if (!c.buildConfig) {
        logError('getConfigProp: c.buildConfig is undefined!');
        return;
    }
    if (!c.platform) return;

    const sourceObj = obj || c.buildConfig;
    const platformObj = sourceObj.platforms?.[c.platform];
    const ps = c.runtime.scheme;

    let resultPlatforms: object | undefined;
    let resultScheme: object | undefined;
    if (platformObj && ps) {
        resultScheme = platformObj.buildSchemes?.[ps]?.[key as PlatformBuildSchemeKey];
        resultPlatforms = getFlavouredProp(platformObj, key);
    }

    const resultCommonRoot = getFlavouredProp(sourceObj.common || {}, key as CommonPropKey);

    const bs: ConfigCommonBuildSchemeSchema =
        (c.runtime.scheme && sourceObj.common?.buildSchemes?.[c.runtime.scheme]) || {};

    const resultCommon = (c.runtime.scheme && getFlavouredProp(bs, key as CommonBuildSchemeKey)) || resultCommonRoot;
    const result: GetConfigPropVal<T, K> = (_getValueOrMergedObject(resultScheme, resultPlatforms, resultCommon) ??
        getFlavouredProp(sourceObj, key as BuildConfigKey)) as GetConfigPropVal<T, K>;

    return result;
};

export const getFlavouredProp = <T, K extends keyof T>(obj: T, key: K): T[K] | undefined => {
    const c = getContext();
    if (!key || !obj || typeof key !== 'string') return undefined;
    const keyScoped = `${key}@${c.runtime.scheme}` as K;
    return obj[keyScoped] || obj[key];
};

export const getTimestampPathsConfig = (): TimestampPathsConfig | undefined => {
    const c = getContext();
    const { platform } = c;
    let timestampBuildFiles: Array<string> = [];
    const pPath = path.join(c.paths.project.builds.dir, `${c.runtime.appId}_${platform}`);
    if (platform === 'web') {
        timestampBuildFiles = (getConfigProp('timestampBuildFiles') || []).map((v) => path.join(pPath, v));
    }
    if (timestampBuildFiles?.length && c.runtime.timestamp) {
        return { paths: timestampBuildFiles, timestamp: c.runtime.timestamp };
    }
    return undefined;
};

//TODO: rename to getPlatformBuildAppDir ???
export const getAppFolder = (isRelativePath?: boolean) => {
    const c = getContext();
    if (isRelativePath) {
        return `platformBuilds/${c.runtime.appId}_${c.platform}${c.runtime._platformBuildsSuffix || ''}`;
    }
    return path.join(
        c.paths.project.builds.dir,
        `${c.runtime.appId}_${c.platform}${c.runtime._platformBuildsSuffix || ''}`
    );
};

export const getPlatformProjectDir = () => {
    const c = getContext();
    if (!c.runtime.engine) {
        logError('getPlatformProjectDir not available without specific engine');
        return null;
    }
    return path.join(getAppFolder(), c.runtime.engine.projectDirName || '');
};

export const getAppConfigBuildsFolder = (customPath?: string) => {
    const c = getContext();
    const { platform } = c;
    const pp = customPath || c.paths.appConfig.dir;
    if (!pp) {
        logWarning(
            `getAppConfigBuildsFolder: Path ${chalk.bold.white(
                'c.paths.appConfig.dir'
            )} not defined! can't return path. You might not be in renative project`
        );
        return null;
    }
    const p = path.join(pp, `builds/${platform}@${c.runtime.scheme}`);
    if (fsExistsSync(p)) return p;
    return path.join(pp, `builds/${platform}`);
};
