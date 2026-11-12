import path from 'node:path';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { RnvFileName } from '../enums/fileName';
import { RnvFolderName } from '../enums/folderName';
import { chalk, logDebug, logDefault, logError, logInfo, logWarning } from '../logger';
import { checkIfProjectAndNodeModulesExists } from '../projects/npm';
import type { ConfigFileProject, ConfigFileTemplate } from '../schema/types';
import {
    copyFileSync,
    copyFolderContentsRecursiveSync,
    fsExistsSync,
    fsLstatSync,
    mergeObjects,
    readObjectSync
} from '../system/fs';
import { doResolve } from '../system/resolve';

export const configureTemplateFiles = async () => {
    logDefault('configureTemplateFiles');

    const c = getContext();

    const templateConfig = readObjectSync<ConfigFileTemplate>(c.paths.template.configTemplate);

    const mergedObj = _getProjectTemplateMergedConfig(templateConfig);
    const includedPaths = mergedObj?.templateConfig?.includedPaths;
    if (!includedPaths || !c.paths.template.dir) return;
    for (const pth of includedPaths) {
        if (typeof pth === 'string') {
            _copyIncludedPaths(c, pth);
            continue;
        }

        const suPlats = c.buildConfig?.defaults?.supportedPlatforms || [];
        if (pth.platforms && suPlats.length) {
            const match = pth.platforms.some((v) => suPlats.includes(v));
            if (!match) continue;
        } else if (pth.engines?.length) {
            const engId = c.runtime.engine?.id;
            if (engId && !pth.engines.includes(engId)) continue;
        }
        for (const p of pth.paths) {
            _copyIncludedPaths(c, p);
        }
    }
};

export const isTemplateInstalled = () => {
    const ctx = getContext();
    const tplName = ctx.buildConfig.templateConfig?.name;
    return tplName ? doResolve(tplName) : false;
};

export const applyTemplate = async () => {
    const c = getContext();
    logDefault('applyTemplate');
    if (c.buildConfig?.isTemplate) return true;
    if (!c.files.project.config) {
        logError('Project config not loaded. cannot apply template');
        return false;
    }
    if (!isTemplateInstalled()) {
        await checkIfProjectAndNodeModulesExists();
    }
    await _applyTemplate(c);
};

const _applyTemplate = async (c: RnvContext) => {
    logDefault('_applyTemplate');

    const tplName = c.buildConfig.templateConfig?.name;
    if (!tplName) {
        logError(`Template config missing. Make sure renative.json >> templateConfig.name is set`);
        return;
    }
    const tpPath = doResolve(tplName);
    if (!tpPath) {
        logError(`Template ${tplName} not found. Make sure it's installed`);
        return;
    }

    c.paths.template.dir = tpPath;
    c.paths.template.config = path.join(tpPath, RnvFileName.renative);
    c.paths.template.configTemplate = path.join(tpPath, RnvFileName.renativeTemplate);

    if (!fsExistsSync(c.paths.template.configTemplate)) {
        logWarning(
            `Template file ${chalk.bold.white(
                c.paths.template.configTemplate
            )} does not exist. check your ${chalk.bold.white(c.paths.template.dir)}. skipping`
        );
        return true;
    }

    logDebug(`_applyTemplate:${c.paths.template.dir}`);

    c.paths.template.appConfigsDir = path.join(tpPath, 'appConfigs');
    c.paths.template.appConfigBase.dir = path.join(tpPath, 'appConfigs', 'base');
    c.runtime.currentTemplate = tplName;

    return true;
};

const _getProjectTemplateMergedConfig = (templateConfig: ConfigFileTemplate | null) => {
    const c = getContext();
    if (c.files.project.config_original && templateConfig) {
        const mergedObj = mergeObjects<ConfigFileTemplate & ConfigFileProject>(
            c,
            templateConfig || {},
            c.files.project.config_original,
            false,
            true
        );
        return mergedObj;
    }
    return null;
};

const _copyIncludedPaths = (c: RnvContext, name: string) => {
    const destPath = path.join(c.paths.project.dir, name);
    // If override exists use it, otherwise use original and continue with rest of the logic
    const sourcePathOriginal = path.join(c.paths.template.dir, name);
    const sourceOverridePath = path.join(c.paths.template.dir, RnvFolderName.templateOverrides, name);
    const sourcePath = fsExistsSync(sourceOverridePath) ? sourceOverridePath : sourcePathOriginal;
    if (fsExistsSync(destPath) || !fsExistsSync(sourcePath)) return;
    try {
        if (fsLstatSync(sourcePath).isDirectory()) {
            logInfo(`Missing directory ${chalk.bold.white(`${destPath}`)}. COPYING from TEMPLATE...DONE`);
            copyFolderContentsRecursiveSync(sourcePath, destPath);
        } else {
            logInfo(`Missing file ${chalk.bold.white(`${destPath}`)}. COPYING from TEMPLATE...DONE`);
            copyFileSync(sourcePath, destPath);
        }
    } catch {}
};
