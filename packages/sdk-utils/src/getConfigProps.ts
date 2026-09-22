import path from 'node:path';
import {
    fsExistsSync,
    getAppConfigBuildsFolder,
    getConfigProp,
    getContext,
    logWarning,
    type RnvPlatform
} from '@rnv/core';

export const getBuildFilePath = (filePath: string, altTemplateFolder?: string) => {
    // P3 => appConfigs + @buildSchemes
    const sp3bf = getAppConfigBuildsFolder();
    if (sp3bf) {
        const sp3 = path.join(sp3bf, filePath);
        if (fsExistsSync(sp3)) return sp3;
    }
    const c = getContext();
    // P2 => appConfigs/base + @buildSchemes
    const sp2bf = getAppConfigBuildsFolder(c.paths.project.appConfigBase.dir);
    if (sp2bf) {
        const sp2 = path.join(sp2bf, filePath);
        if (fsExistsSync(sp2)) return sp2;
    }
    // P1 => platformTemplates
    return path.join(altTemplateFolder || (getAppTemplateFolder() as string), filePath);
};

export const getAppId = () => {
    const id = getConfigProp('id');
    const idSuffix = getConfigProp('idSuffix') || '';
    return `${id}${idSuffix}`;
};

export const getAppTitle = () => getConfigProp('title');

export const getAppAuthor = () => getConfigProp('author') || getContext().files.project.package?.author;

export const getAppLicense = () => getConfigProp('license') || getContext().files.project.package?.license;

export const getEntryFile = () => {
    const c = getContext();
    return c.platform ? c.buildConfig.platforms?.[c.platform]?.entryFile : undefined;
};

export const getGetJsBundleFile = () => getConfigProp('getJsBundleFile');

export const getAppDescription = () => getConfigProp('description') || getContext().files.project.package?.description;

const versionSeparatorRegex = /[.+-]/;

export const getAppVersion = () => {
    const version = getConfigProp('version') || getContext().files.project.package?.version;
    if (!version) {
        logWarning('You are missing version prop in your config. will default to 0');
        return '0';
    }
    const versionFormat = getConfigProp('versionFormat');
    if (!versionFormat) return version;
    const versionCodeArr = versionFormat.split('.');
    const dotLength = versionCodeArr.length;
    const isNumArr = versionCodeArr.map((v: string) => !Number.isNaN(Number(v)));

    return version
        .split(versionSeparatorRegex)
        .flatMap((v, i) => (!isNumArr[i] || !Number.isNaN(Number(v)) ? v : []))
        .slice(0, dotLength)
        .join('.');
};

const _androidLikePlatform = (platform: RnvPlatform) => ['android', 'androidwear'].includes(platform as string);

/**
 * Retrieves the version code for the specified platform from the configuration.
 * If the platform is Android, the version code must be a positive integer.
 * If the version code is not found or is invalid, it falls back to a default value of '0'.
 * Otherwise version code is generated based on the version and version code format specified in the configuration.
 *
 * @param c - The RnvContext object.
 * @param platform - The RnvPlatform object.
 * @returns The version code as a string.
 * @throws An error if the version code is not a positive integer for Android platforms.
 */
export const getAppVersionCode = () => {
    const c = getContext();
    const versionCode = getConfigProp('versionCode');

    if (versionCode) {
        // android platforms don't allow versionCode to be a string, only positive integer
        if (_androidLikePlatform(c.platform)) {
            const isValidVersionCode = Number.isInteger(Number(versionCode)) && Number(versionCode) > 0;
            if (!isValidVersionCode) {
                throw new Error(`'versionCode' should be a positive integer. Check your config`);
            }
        }
        return versionCode;
    }

    const version = getConfigProp('version') || c.files.project.package?.version;
    if (!version || typeof version !== 'string') {
        logWarning('You are missing version prop in your config. will default to 0');
        return '0';
    }
    const versionCodeFormat = getConfigProp('versionCodeFormat') || '00.00.00';
    const vFormatArr = versionCodeFormat.split('.').map((v: string) => v.length);
    const verArr: string[] = version.split(versionSeparatorRegex).reduce((acc, v) => {
        const asNumber = Number(v);
        if (Number.isNaN(asNumber)) return acc;
        const maxDigits = vFormatArr[acc.length] || 2;
        const padLength = Math.max(0, maxDigits - v.length);
        acc.push(`${'0'.repeat(padLength)}${v.slice(0, maxDigits)}`);
        return acc;
    }, [] as string[]);
    const versionCodeMaxCount = vFormatArr.length;
    let extraVersionLen = 0;
    for (let verCountDiff = versionCodeMaxCount - verArr.length; verCountDiff > 0; verCountDiff--) {
        extraVersionLen += vFormatArr[versionCodeMaxCount - verCountDiff] ?? 0;
    }

    return Number(verArr.join('').concat('', '0'.repeat(extraVersionLen))).toString();
};

export const getAppTemplateFolder = () => {
    const c = getContext();
    const { platform } = c;
    return platform ? path.join(c.paths.project.platformTemplatesDirs[platform], `${platform}`) : undefined;
};
