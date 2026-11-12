import path from 'node:path';
import { generateContextPaths } from '../context';
import { generateRnvConfigPathObj } from '../context/defaults';
import { getContext } from '../context/provider';
import type { RnvContextFileObj, RnvContextPathObj } from '../context/types';
import { RnvFileName } from '../enums/fileName';
import { RnvFolderName } from '../enums/folderName';
import { chalk, logDebug, logDefault, logWarning } from '../logger';
import type { ConfigFileTemplates } from '../schema/types';
import { fsExistsSync, fsReaddirSync, getRealPath, loadFile, mergeObjects, readObjectSync } from '../system/fs';
import { doResolve, doResolveDefault } from '../system/resolve';
import { generateBuildConfig } from './buildConfig';
import { generateLocalConfig } from './configLocal';
import { generatePlatformTemplatePaths } from './configProject';
import { getWorkspaceDirPath } from './workspaces';

export const loadExtendedConfigFile = (fileObj: Record<string, any>, pathObj: RnvContextPathObj) => {
    const c = getContext();
    const key = 'config';
    const result = loadFile(fileObj, pathObj, key);
    if (!result) return result;

    fileObj[`${key}_original`] = { ...fileObj[key] };
    const { extendsTemplate } = fileObj[key];
    if (!extendsTemplate) return result;

    // extendsTemplate only applies to standard 'config'
    const currTemplate =
        c.files.project.config?.templateConfig?.name ||
        fileObj.config.templateConfig?.name ||
        extendsTemplate.startsWith('@')
            ? extendsTemplate.split('/').slice(0, 2).join('/')
            : extendsTemplate.split('/').slice(0, 1);
    if (!currTemplate) return result;

    const currTemplateRes = doResolve(currTemplate);
    if (!currTemplateRes) {
        logWarning(`Cannot resolve currentTemplate ${currTemplate} `);
        return result;
    }
    const extendsPath = path.join(
        currTemplateRes,
        extendsTemplate.replace(currTemplate, extendsTemplate.startsWith(currTemplate) ? '' : currTemplate)
    );
    if (!fsExistsSync(extendsPath)) {
        logWarning(`You are trying to extend config file with ${extendsPath} does not exists. SKIPPING.`);
        return result;
    }
    const extendsFile = readObjectSync(extendsPath) || {};

    fileObj[key] = mergeObjects(c, extendsFile, fileObj[key], false, true);
    // CLEAN props which should not be inherited
    delete fileObj[key].isTemplate;
    delete fileObj[key].tasks;
    return result;
};

const createRnvContextFileObj = () => ({ configs: [], configsLocal: [], configsPrivate: [] });
const createRnvContextConfigPaths = (pth: string) => ({
    config: path.join(pth, RnvFileName.renative),
    configLocal: path.join(pth, RnvFileName.renativeLocal),
    configPrivate: path.join(pth, RnvFileName.renativePrivate)
});
const updateRnvContextPathObj = (target: RnvContextPathObj, pth: string, src?: RnvContextPathObj) => {
    target.dirs.push(pth);
    target.fontsDirs.push(path.join(pth, 'fonts'));
    target.pluginDirs.push(path.join(pth, 'plugins'));
    if (src) {
        target.configs.push(src.config);
        target.configsPrivate.push(src.configPrivate);
        target.configsLocal.push(src.configLocal);
    } else {
        const { config, configLocal, configPrivate } = createRnvContextConfigPaths(pth);
        target.configs.push(config);
        target.configsPrivate.push(configPrivate);
        target.configsLocal.push(configLocal);
    }
};
const _loadConfigFiles = (
    fileObj: RnvContextFileObj<object>,
    pathObj: RnvContextPathObj,
    parseAppConfigs?: boolean
) => {
    let extendAppId: string | undefined;

    const fileObjConfig = loadExtendedConfigFile(fileObj, pathObj);
    if (fileObjConfig && Object.hasOwn(fileObjConfig, 'extend')) {
        extendAppId = (fileObjConfig.extend as string) || extendAppId;
    }
    loadFile(fileObj, pathObj, 'configLocal');
    loadFile(fileObj, pathObj, 'configPrivate');

    if (parseAppConfigs) {
        Object.assign(pathObj, createRnvContextFileObj());
        pathObj.dirs = [];
        pathObj.fontsDirs = [];
        pathObj.pluginDirs = [];

        // PATH1: appConfigs/base
        const path1 = path.join(pathObj.appConfigsDir, 'base');

        const pathObj1: RnvContextPathObj = {
            ...generateRnvConfigPathObj(),
            ...createRnvContextConfigPaths(path1)
        };
        updateRnvContextPathObj(pathObj, path1, pathObj1);

        const configs: (RnvContextFileObj<object>['config'] | undefined)[] = [];
        const configsPrivate: (RnvContextFileObj<object>['configPrivate'] | undefined)[] = [];
        const configsLocal: (RnvContextFileObj<object>['configLocal'] | undefined)[] = [];

        const _loadAndUpdateConfigArray = (pthObj: RnvContextPathObj, isOriginal = false) => {
            const tmp: RnvContextFileObj<object> = isOriginal ? fileObj : createRnvContextFileObj();
            loadExtendedConfigFile(tmp, pthObj);
            loadFile(tmp, pthObj, 'configPrivate');
            loadFile(tmp, pthObj, 'configLocal');
            configs.push(tmp.config);
            configsPrivate.push(tmp.configPrivate);
            configsLocal.push(tmp.configLocal);
        };
        // FILE1: appConfigs/base
        _loadAndUpdateConfigArray(pathObj1);

        if (extendAppId && extendAppId !== 'base' && fsExistsSync(pathObj.appConfigsDir)) {
            const appConfigsDirNames = fsReaddirSync(pathObj.appConfigsDir);
            if (appConfigsDirNames.includes(extendAppId)) {
                const path2 = path.join(pathObj.appConfigsDir, extendAppId);
                const pathObj2: RnvContextPathObj = {
                    ...generateRnvConfigPathObj(),
                    ...createRnvContextConfigPaths(path2)
                };
                // PATH2: appConfigs/<extendConfig>
                updateRnvContextPathObj(pathObj, path2, pathObj2);
                // FILE2: appConfigs/<extendConfig>
                _loadAndUpdateConfigArray(pathObj2);
            }
        }

        // PATH3: appConfigs/<appId>
        const path3 = pathObj.dir;
        updateRnvContextPathObj(pathObj, path3);

        // FILE3: appConfigs/<appId>
        _loadAndUpdateConfigArray(pathObj, true);

        Object.assign(fileObj, {
            configs: configs.filter(Boolean),
            configsPrivate: configsPrivate.filter(Boolean),
            configsLocal: configsLocal.filter(Boolean)
        });
    }

    generateBuildConfig();
    // return result;
};

export const generateLookupPaths = (pkgName: string) => {
    const pathLookups: string[] = [
        // Following ones are for monorepo
        path.join(__dirname, '../..', RnvFolderName.nodeModules, pkgName),
        path.resolve(__dirname, '../../..', RnvFolderName.nodeModules, pkgName),
        path.resolve(__dirname, '../../../..', RnvFolderName.nodeModules, pkgName),
        // Following ones are for globally installed RNV
        path.join(__dirname, '../..', pkgName),
        path.resolve(__dirname, '../../..', pkgName),
        path.resolve(__dirname, '../../../..', pkgName)
    ];
    return pathLookups;
};

export const loadDefaultConfigTemplates = () => {
    const ctx = getContext();
    //This comes from project dependency
    const pkgName = '@rnv/config-templates';

    let configTemplatesPath = doResolveDefault(pkgName);
    if (!configTemplatesPath) throw new Error(`@rnv/config-templates missing`);

    if (!fsExistsSync(configTemplatesPath)) {
        const pathLookups = generateLookupPaths(pkgName);
        configTemplatesPath = pathLookups.find((v) => fsExistsSync(v));

        if (!configTemplatesPath) {
            throw new Error(
                `RNV Cannot find package: ${chalk.bold.white(pkgName)}. Looked in: ${chalk.gray(
                    pathLookups.join(', ')
                )}`
            );
        }
    }

    const configPath = path.join(configTemplatesPath, RnvFileName.renativeTemplates);
    const pluginTemplatePath = path.join(configTemplatesPath, 'pluginTemplates');
    ctx.paths.rnvConfigTemplates.pluginTemplatesDir = pluginTemplatePath;
    ctx.paths.rnvConfigTemplates.config = configPath;

    const rnvConfigTemplates = readObjectSync<ConfigFileTemplates>(configPath);

    if (rnvConfigTemplates) {
        ctx.files.rnvConfigTemplates.config = rnvConfigTemplates;
        ctx.files.scopedConfigTemplates = {
            rnv: rnvConfigTemplates
        };
    }

    ctx.paths.scopedConfigTemplates = {
        configs: {
            rnv: configPath
        },
        pluginTemplatesDirs: {
            rnv: pluginTemplatePath
        }
    };
};

export const parseRenativeConfigs = async () => {
    logDefault('parseRenativeConfigs');
    const c = getContext();

    // LOAD ./package.json
    loadFile(c.files.project, c.paths.project, 'package');

    // LOAD ./RENATIVE.*.JSON
    _loadConfigFiles(c.files.project, c.paths.project);

    c.paths.project.builds.config = path.join(
        c.paths.project.builds.dir,
        `${c.runtime.appId || '<TBC>'}_${c.platform}.json`
    );

    // LOAD ./platformBuilds/RENATIVE.BUILLD.JSON
    loadFile(c.files.project.builds, c.paths.project.builds, 'config');

    // LOAD WORKSPACE /RENATIVE.*.JSON
    const wsDir = getRealPath(await getWorkspaceDirPath(c));
    if (wsDir) {
        generateContextPaths(c.paths.workspace, wsDir);
        _loadConfigFiles(c.files.workspace, c.paths.workspace);
    }

    if (!c.files.project.config) {
        logDebug(`BUILD_CONFIG: c.files.project.config does not exists. path: ${c.paths.project.config}`);
        return;
    }

    // LOAD WORKSPACE /[PROJECT_NAME]/RENATIVE.*.JSON
    if (!c.files.project.config.projectName) {
        throw new Error('Your renative.json is missing required property: projectName ');
    }
    generateContextPaths(
        c.paths.workspace.project,
        path.join(c.paths.workspace.dir, c.files.project.config.projectName)
    );
    _loadConfigFiles(c.files.workspace.project, c.paths.workspace.project);

    c.paths.workspace.project.appConfigBase.dir = path.join(c.paths.workspace.project.dir, 'appConfigs', 'base');

    generatePlatformTemplatePaths();

    if (!c.runtime.appId) return;

    if (c.runtime.appConfigDir) {
        generateContextPaths(c.paths.appConfig, c.runtime.appConfigDir);
        _loadConfigFiles(c.files.appConfig, c.paths.appConfig, true);
    }

    c.paths.workspace.project.appConfigsDir =
        getRealPath(c.buildConfig.workspaceAppConfigsDir) || path.join(c.paths.workspace.project.dir, 'appConfigs');

    generateContextPaths(
        c.paths.workspace.appConfig,
        path.join(c.paths.workspace.project.appConfigsDir, c.runtime.appId)
    );

    _loadConfigFiles(c.files.workspace.appConfig, c.paths.workspace.appConfig, true);

    loadFile(c.files.project.assets, c.paths.project.assets, 'config');

    // LOAD WORKSPACE /RENATIVE.*.JSON
    const wsPath = await getWorkspaceDirPath(c); // possibly duplicate.
    if (wsPath) {
        const wsPathReal = getRealPath(wsPath);
        // could replace with wsDir
        if (wsPathReal) {
            generateContextPaths(c.paths.workspace, wsPathReal);
            _loadConfigFiles(c.files.workspace, c.paths.workspace);
        }
    }

    generateLocalConfig();
    generateBuildConfig();
};
