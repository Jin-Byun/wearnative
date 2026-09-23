import * as crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inquirerPrompt } from '../api';
import { parseRenativeConfigs } from '../configs';
import { writeRenativeConfigFile } from '../configs/utils';
import { getAppConfigBuildsFolder, getAppFolder, getConfigProp, getConfigRootProp } from '../context/contextProps';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { RnvFileName } from '../enums/fileName';
import { chalk, logDebug, logDefault, logError, logInfo, logSuccess, logWarning } from '../logger';
import { createDependencyMutation } from '../projects/mutations';
import { installPackageDependencies } from '../projects/npm';
import { updatePackage } from '../projects/package';
import type { AsyncCallback } from '../projects/types';
import type {
    ConfigFileOverrides,
    ConfigFilePlugin,
    ConfigFileTemplates,
    ConfigPluginPlatformSchema,
    ConfigPluginSchema,
    ConfigProjectPaths
} from '../schema/types';
import {
    copyFolderContentsRecursiveSync,
    fsCopyFileSync,
    fsExistsSync,
    fsLstatSync,
    fsMkdirSync,
    fsReaddirSync,
    fsReadFileSync,
    fsStatSync,
    fsWriteFileSync,
    mergeObjects,
    readObjectSync,
    sanitizeDynamicProps
} from '../system/fs';
import { doResolve } from '../system/resolve';
import type { OverridesOptions, ResolveOptions } from '../system/types';
import type { PluginCallback, RnvPlugin, RnvPluginScope } from './types';

const _getPluginScope = (plugin: ConfigPluginSchema | string): RnvPluginScope => {
    if (typeof plugin === 'string') {
        if (plugin.startsWith('source:')) {
            return { scope: plugin.split(':').pop() || 'rnv' };
        }
        return { npmVersion: plugin, scope: 'rnv' };
    }
    if (plugin?.source) {
        return { scope: plugin?.source };
    }
    return { scope: 'rnv' };
};

export const getMergedPlugin = (c: RnvContext, key: string) => {
    logDebug(`getMergedPlugin:${key}`);

    const plugin = c.buildConfig.plugins?.[key];
    if (!plugin) return null;

    const scopes: Array<string> = [];

    const mergedPlugin = _getMergedPlugin(c, plugin, key, undefined, scopes);
    scopes.reverse();

    mergedPlugin._scopes = scopes;
    mergedPlugin._id = key;
    return mergedPlugin;
};

const _getMergedPlugin = (
    c: RnvContext,
    plugin: ConfigPluginSchema | string | undefined,
    pluginKey: string,
    parentScope?: string,
    scopes?: Array<string>,
    skipSanitize?: boolean
): RnvPlugin => {
    if (!plugin) {
        return {};
    }

    const { scope, npmVersion } = _getPluginScope(plugin);

    const mergedPlgn: RnvPlugin = typeof plugin !== 'string' ? plugin : {};
    if (scope === parentScope) {
        return mergedPlgn;
    }

    if (npmVersion) {
        return {
            version: npmVersion
        };
    }
    if (scope !== '' && scope && !c.buildConfig.scopedPluginTemplates?.[scope] && !c.runtime._skipPluginScopeWarnings) {
        logWarning(`Plugin ${pluginKey} is not recognized plugin in ${scope} scope`);
    } else if (scope && scopes) {
        let skipScope = false;
        if (parentScope) {
            const skipRnvOverrides = c.buildConfig.disableRnvDefaultOverrides;

            if (skipRnvOverrides && scope === 'rnv') {
                // Merges down to RNV defaults will be skipped
                skipScope = true;
            }
        }

        if (!skipScope) scopes.push(scope);
    }

    const parentPlugin = _getMergedPlugin(
        c,
        c.buildConfig.scopedPluginTemplates?.[scope]?.[pluginKey],
        pluginKey,
        scope,
        scopes,
        true
    );
    let currentPlugin: ConfigPluginSchema;
    if (typeof plugin === 'string' || plugin instanceof String) {
        currentPlugin = {};
    } else {
        currentPlugin = plugin;
    }

    if (currentPlugin.pluginDependencies) {
        Object.keys(currentPlugin.pluginDependencies).forEach((plugDepKey) => {
            if (currentPlugin.pluginDependencies?.[plugDepKey] === 'source:self') {
                currentPlugin.pluginDependencies[plugDepKey] = `source:${parentScope}`;
            }
        });
    }
    const mergedObj = mergeObjects<RnvPlugin>(c, parentPlugin, currentPlugin, true, true);
    if (c._renativePluginCache[pluginKey]) {
        mergedObj.config = c._renativePluginCache[pluginKey];
    }

    // IMPORTANT: only final top level merge should be sanitized
    const obj = skipSanitize
        ? mergedObj
        : sanitizeDynamicProps(mergedObj, {
              files: c.files,
              runtimeProps: c.runtime,
              props: c.buildConfig?._refs || {},
              configProps: c.injectableConfigProps
          });

    // IMPORTANT: only final top level merge should be sanitized
    const mergedPlugin: RnvPlugin = skipSanitize
        ? obj
        : sanitizeDynamicProps(obj, {
              files: c.files,
              runtimeProps: c.runtime,
              props: obj.props || {},
              configProps: c.injectableConfigProps
          });

    return mergedPlugin;
};

const _applyPackageDependency = (deps: Record<string, string>, key: string, version: string) => {
    const ctx = getContext();
    const { resolutions } = ctx.files.project.package;
    const res = resolutions?.[key];
    if (res) {
        logInfo(`Found resolutions override for ${key}@${res}`);
        deps[key] = res;
    } else {
        deps[key] = version;
    }
};

export const configurePlugins = async () => {
    logDefault('configurePlugins');

    const c = getContext();

    if (c.program.opts().skipDependencyCheck) return true;

    if (!c.files.project.package.dependencies) {
        c.files.project.package.dependencies = {};
    }

    if (!c.buildConfig?.plugins) {
        return;
    }

    const { dependencies, devDependencies } = c.files.project.package;

    Object.keys(c.buildConfig.plugins).forEach((k) => {
        const plugin = getMergedPlugin(c, k);

        if (!plugin) {
            if (c.buildConfig?.plugins?.[k] === null) {
                // Skip Warning as this is intentional "plugin":null override
            } else {
                logWarning(
                    `Plugin with name ${chalk.bold.white(
                        k
                    )} does not exists in ReNative source:rnv scope. you need to define it manually here: ${chalk.bold.white(
                        c.paths.project.builds.config
                    )}`
                );
            }
        } else if (
            plugin &&
            plugin.disabled !== true &&
            plugin.disableNpm !== true &&
            c.platform &&
            (plugin.supportedPlatforms ? plugin.supportedPlatforms.includes(c.platform) : true)
        ) {
            if (dependencies && dependencies[k]) {
                if (!plugin.version) {
                    if (!c.runtime._skipPluginScopeWarnings) {
                        logInfo(`Plugin ${k} not ready yet (waiting for scope ${plugin.scope}). SKIPPING...`);
                    }
                } else if (dependencies[k] !== plugin.version) {
                    //                 logWarning(
                    //                     `Version mismatch of dependency ${chalk.bold(k)} between:
                    // ${chalk.bold(c.paths.project.package)}: v(${chalk.red(dependencies[k])}) and
                    // ${chalk.bold(c.paths.project.builds.config)}: v(${chalk.green(plugin.version)}).
                    // ${ovMsg}`
                    //                 );

                    createDependencyMutation({
                        name: k,
                        original: {
                            version: dependencies[k]
                        },
                        updated: {
                            version: plugin.version
                        },
                        type: 'dependencies',
                        msg: 'Version mismatch',
                        source: 'plugin (renative.json)',
                        targetPath: c.paths.project.package
                    });

                    // hasPackageChanged = true;
                    // _applyPackageDependency(newDeps, k, plugin.version);
                }
            } else if (devDependencies && devDependencies[k]) {
                if (!plugin.version) {
                    if (!c.runtime._skipPluginScopeWarnings) {
                        logInfo(`Plugin ${k} not ready yet (waiting for scope ${plugin.scope}). SKIPPING...`);
                    }
                } else if (devDependencies[k] !== plugin.version) {
                    // logWarning(
                    //     `Version mismatch of devDependency ${chalk.bold(k)} between package.json: v(${chalk.red(
                    //         devDependencies[k]
                    //     )}) and plugins.json: v(${chalk.red(plugin.version)}). ${ovMsg}`
                    // );

                    createDependencyMutation({
                        name: k,
                        original: {
                            version: devDependencies[k]
                        },
                        updated: {
                            version: plugin.version
                        },
                        type: 'devDependencies',
                        msg: 'Version mismatch',
                        source: 'plugin (renative.json)',
                        targetPath: c.paths.project.package
                    });

                    // hasPackageChanged = true;
                    // _applyPackageDependency(newDevDeps, k, plugin.version);
                }
            } else {
                // Dependency does not exists
                if (plugin.version) {
                    // logInfo(
                    //     `Missing dependency ${chalk.bold(k)} v(${chalk.red(
                    //         plugin.version
                    //     )}) in package.json. ${ovMsg}`
                    // );

                    createDependencyMutation({
                        name: k,
                        updated: {
                            version: plugin.version
                        },
                        // TODO: should be controlled by plugin if this devDependency
                        type: 'dependencies',
                        msg: 'Missing dependency',
                        source: 'plugin (renative.json)',
                        targetPath: c.paths.project.package
                    });

                    // hasPackageChanged = true;
                    // if (plugin.version) {
                    //     _applyPackageDependency(newDeps, k, plugin.version);
                    // }
                }
            }
        }

        if (plugin && plugin.npm) {
            Object.keys(plugin.npm).forEach((npmKey) => {
                // const npmKey = _npmKey as NpmDepKey;
                const npmDep = plugin.npm?.[npmKey];
                // IMPORTANT: Do not override top level override with plugin.npm ones
                const topLevelPlugin = getMergedPlugin(c, npmKey);
                if (topLevelPlugin && topLevelPlugin?.version !== npmDep) {
                    logWarning(`RNV Detected plugin dependency conflict.
- ${npmKey}@${chalk.green(topLevelPlugin?.version)} ${chalk.cyan('<=')}
- ${k} .npm sub dependencies:
   |- ${npmKey}@${chalk.red(npmDep)}`);
                } else if (!dependencies[npmKey]) {
                    // logInfo(`Plugin ${chalk.bold(k)} requires npm dependency ${chalk.bold(npmKey)}. ${ovMsg}`);
                    if (npmDep) {
                        createDependencyMutation({
                            name: npmKey,
                            updated: {
                                version: npmDep
                            },
                            // TODO: should be controlled by plugin if this devDependency
                            type: 'dependencies',
                            msg: 'Missing dependency',
                            source: 'plugin.npm (renative.json)',
                            targetPath: c.paths.project.package
                        });
                        // _applyPackageDependency(newDeps, npmKey, npmDep);
                        // hasPackageChanged = true;
                    }
                } else if (dependencies[npmKey] !== npmDep) {
                    // logWarning(
                    //     `Plugin ${chalk.bold(k)} npm dependency ${chalk.bold(npmKey)} mismatch (${chalk.red(
                    //         dependencies[npmKey]
                    //     )}) => (${chalk.green(npmDep)}) .${ovMsg}`
                    // );
                    if (npmDep) {
                        createDependencyMutation({
                            name: npmKey,
                            original: {
                                version: dependencies[npmKey]
                            },
                            updated: {
                                version: npmDep
                            },
                            // TODO: should be controlled by plugin if this devDependency
                            type: 'dependencies',
                            msg: 'Version mismatch',
                            source: 'plugin.npm (renative.json)',
                            targetPath: c.paths.project.package
                        });
                        // _applyPackageDependency(newDeps, npmKey, npmDep);
                        // hasPackageChanged = true;
                    }
                }
            });
        }
    });

    return true;
};

export const resolvePluginDependants = async () => {
    const c = getContext();

    logDefault('resolvePluginDependants');
    const { plugins } = c.buildConfig;

    if (plugins) {
        const pluginKeys = Object.keys(plugins);
        for (let i = 0; i < pluginKeys.length; i++) {
            const key = pluginKeys[i];
            await _resolvePluginDependencies(c, key, plugins[key]);
        }
    }

    return true;
};

const _resolvePluginDependencies = async (
    c: RnvContext,
    key: string,
    keyScope: ConfigPluginSchema | string,
    parentKey?: string
) => {
    // IMPORTANT: Do not cache this valuse as they need to be refreshed every
    // round in case new plugin has been installed and c.buildConfig generated
    if (keyScope === null) {
        return true;
    }

    const { scopedPluginTemplates } = c.buildConfig;
    const plugin = getMergedPlugin(c, key);

    const { scope } = _getPluginScope(keyScope);

    if (!plugin) {
        const depPlugin = scopedPluginTemplates?.[scope]?.[key];
        if (depPlugin) {
            // console.log('INSTALL PLUGIN???', key, depPlugin.source);
            const { confirm } = await inquirerPrompt({
                type: 'confirm',
                message: `Install ${key}?`,
                warningMessage: `Plugin ${chalk.bold.white(key)} source:${chalk.bold.white(
                    scope
                )} required by ${chalk.red(parentKey)} is not installed`
            });
            if (confirm && c.files.project.config_original?.plugins) {
                c.files.project.config_original.plugins[key] = `source:${scope}`;
                writeRenativeConfigFile(c.paths.project.config, c.files.project.config_original);
                logSuccess(`Plugin ${key} sucessfully installed`);
                c._requiresNpmInstall = true;
            }
        } else {
            logWarning(
                `Plugin ${chalk.bold.white(parentKey)} requires ${chalk.red(key)} which is not available in your system`
            );
        }
    } else {
        // All good
    }

    const deps = plugin?.pluginDependencies;
    if (deps) {
        const depsKeys = Object.keys(deps);
        for (let i = 0; i < depsKeys.length; i++) {
            const depKey = depsKeys[i];
            const depScope = deps[depKey];
            if (depScope) {
                await _resolvePluginDependencies(c, depKey, depScope, key);
            }
        }
    }
    return true;
};

export const parsePlugins = (
    pluginCallback: PluginCallback,
    ignorePlatformObjectCheck?: boolean,
    includeDisabledOrExcludedPlugins?: boolean
) => {
    const c = getContext();
    const { platform, buildConfig } = c;
    logDefault('parsePlugins');
    if (!buildConfig) return;
    // default to all plugins if it's not defined (null allowed for overrides)
    const includedPlugins = getConfigProp('includedPlugins') ?? ['*'];
    if (!includedPlugins) {
        logWarning(
            `You haven't included any ${chalk.bold.white(
                '{ common: { includedPlugins: [] }}'
            )} in your ${chalk.bold.white(c.paths.appConfig.config)}. Your app might not work correctly`
        );
        return;
    }

    const { plugins } = buildConfig;
    if (!plugins) {
        logError(`You have no plugins defined in ${chalk.bold.white(c.paths.project.builds.config)}`);
        return;
    }

    const excludedPlugins = getConfigProp('excludedPlugins') || [];
    const supportedPlatforms = c.files.project.config?.defaults?.supportedPlatforms || [];
    const platformsToCheck = platform ? [platform] : supportedPlatforms;
    const parsedPlugins: string[] = [];
    const handleActivePlugin = (plugin: RnvPlugin, pluginPlat: ConfigPluginPlatformSchema, key: string) => {
        const { _id, deprecated, version } = plugin;
        // log deprecated if present
        if (_id) {
            if (parsedPlugins.includes(_id)) {
                return;
            }
            parsedPlugins.push(_id);
        }
        if (deprecated) {
            logWarning(deprecated);
        }
        if (pluginCallback) {
            c.runtime.plugins[key] = plugin;
            if (version) {
                c.runtime.pluginVersions[key] = version;
            }
            pluginCallback(plugin, pluginPlat, key);
        }
    };

    for (const key of Object.keys(plugins)) {
        const plugin = getMergedPlugin(c, key);
        if (!plugin) continue;
        if ((includedPlugins.includes('*') || includedPlugins.includes(key)) && !excludedPlugins.includes(key)) {
            for (const p of platformsToCheck) {
                const pluginPlat: ConfigPluginPlatformSchema = plugin[p] || {};
                const isPluginPlatDisabled = !!pluginPlat.disabled;
                const isPluginDisabled = !!plugin.disabled;
                const isPluginPlatSupported = plugin.supportedPlatforms ? plugin.supportedPlatforms.includes(p) : true;

                if (ignorePlatformObjectCheck || includeDisabledOrExcludedPlugins) {
                    if (isPluginDisabled) {
                        logDefault(`Plugin ${key} is marked disabled. skipping.`);
                    } else if (isPluginPlatDisabled) {
                        logDefault(`Plugin ${key} is marked disabled for platform ${p}. skipping.`);
                    } else if (!isPluginPlatSupported) {
                        logDefault(`Plugin ${key}'s supportedPlatforms does not include ${p}. skipping.`);
                    }
                    handleActivePlugin(plugin, pluginPlat, key);
                } else if (!isPluginPlatDisabled && !isPluginDisabled && isPluginPlatSupported) {
                    handleActivePlugin(plugin, pluginPlat, key);
                }
            }
        } else if (includeDisabledOrExcludedPlugins && excludedPlugins.includes(key)) {
            for (const p of platformsToCheck) {
                const pluginPlat = plugin[p] || {};
                plugin.disabled = true;
                handleActivePlugin(plugin, pluginPlat, key);
            }
        }
    }
};

export const loadPluginTemplates = async () => {
    logDefault('loadPluginTemplates');

    const c = getContext();
    const { project } = c.files;
    const customPluginTemplates = project.config?.paths?.pluginTemplates;
    if (customPluginTemplates) {
        const missingDeps = _parsePluginTemplateDependencies(c, customPluginTemplates);

        if (missingDeps.length) {
            const dependencies = project.package.dependencies || {};
            project.package.dependencies = dependencies;
            let hasPackageChanged = false;
            missingDeps.forEach((dep) => {
                const plugin = getMergedPlugin(c, dep);
                if (plugin?.version) {
                    hasPackageChanged = true;
                    _applyPackageDependency(dependencies, dep, plugin.version);
                }
            });
            // CHECK IF paths.pluginTemplates SCOPES are INSTALLED
            // This must be installed to avoid scoped plugins errors
            if (hasPackageChanged) {
                updatePackage({ dependencies });
                logInfo('Found missing dependency scopes. INSTALLING...');
                await installPackageDependencies();
                await loadPluginTemplates();
            } else {
                logWarning(
                    missingDeps.map((npmDep) => `Plugin scope ${npmDep} does not exists in package.json.`).join('\n')
                );
            }
        }
    }

    return true;
};

const _parsePluginTemplateDependencies = (
    c: RnvContext,
    customPluginTemplates: ConfigProjectPaths['pluginTemplates'],
    scope = 'root'
) => {
    logDefault('_parsePluginTemplateDependencies', `scope:${scope}`);
    const missingDeps: Array<string> = [];
    if (customPluginTemplates) {
        Object.keys(customPluginTemplates).forEach((k) => {
            const val = customPluginTemplates[k];
            if (val.npm) {
                const npmDep =
                    c.files.project.package?.dependencies?.[val.npm] ||
                    c.files.project.package?.devDependencies?.[val.npm];

                if (npmDep) {
                    let ptPath;
                    let ptConfig;
                    let ptRootPath;
                    if (npmDep.startsWith('file:')) {
                        ptPath = path.join(c.paths.project.dir, npmDep.replace('file:', ''), val.path || '');
                    } else {
                        ptRootPath = doResolve(val.npm);
                    }
                    if (ptRootPath) {
                        ptPath = path.join(ptRootPath, val.path);
                        c.paths.scopedConfigTemplates.pluginTemplatesDirs[k] = ptPath;
                        ptConfig = path.join(ptRootPath, RnvFileName.renativeTemplates);
                        if (!fsExistsSync(ptConfig)) {
                            // DEPRECATED Legacy Support
                            ptConfig = path.join(ptRootPath, val.path, 'renative.plugins.json');
                        }
                    }

                    if (fsExistsSync(ptConfig)) {
                        const ptConfigs = c.files.scopedConfigTemplates;
                        const ptConfigFile = readObjectSync<ConfigFileTemplates>(ptConfig);
                        if (ptConfigFile) {
                            ptConfigs[k] = ptConfigFile;
                        }

                        // _parsePluginTemplateDependencies(
                        //     c,
                        //     c.files.scopedPluginTemplates[k].pluginTemplateDependencies,
                        //     k
                        // );
                    } else {
                        logWarning(`Plugin scope ${val.npm} is not installed yet.`);
                    }
                } else {
                    // logWarning(`Plugin scope ${val.npm} does not exists in package.json.`);
                    missingDeps.push(val.npm);
                }
            }
        });
    }
    return missingDeps;
};

const getCleanRegExString = (str: string) => str.replace(/[-\\.,_*+?^$[\](){}!=|`]/gi, '\\$&');

const _overridePlugin = (c: RnvContext, pluginsPath: string, dir: string) => {
    const rootPath = _getRootPath();

    const nodeModulesPaths = _findAllNodeModules(rootPath);
    const source = path.join(pluginsPath, dir, 'overrides');

    nodeModulesPaths.forEach((nodeModulesPath) => {
        const dest = path.join(nodeModulesPath, dir);
        if (!fsExistsSync(dest)) return;

        const plugin = getMergedPlugin(c, dir);
        let flavourSource;
        if (plugin) {
            flavourSource = path.resolve(pluginsPath, dir, `overrides@${plugin.version}`);
        }

        if (flavourSource && fsExistsSync(flavourSource)) {
            _applyOverrideFiles(flavourSource, dest, dir);
        } else if (fsExistsSync(source)) {
            _applyOverrideFiles(source, dest, dir);
        } else {
            logDebug(
                `Your plugin configuration has no override path ${chalk.bold.white(
                    source
                )}. skipping folder override action`
            );
        }

        let overridePath: string | undefined;
        if (plugin?.version) {
            const pluginVerArr = plugin.version.split('.');
            const pluginVersions: Array<string> = [];
            let prevVersion: string;
            pluginVerArr.forEach((v) => {
                if (prevVersion) {
                    prevVersion = `${prevVersion}.${v}`;
                } else {
                    prevVersion = `${v}`;
                }
                pluginVersions.push(prevVersion);
            });
            pluginVersions.reverse();

            for (let i = 0; i < pluginVersions.length; i++) {
                overridePath = path.resolve(pluginsPath, dir, `overrides@${pluginVersions[i]}.json`);
                if (fsExistsSync(overridePath)) {
                    break;
                }
            }
        }

        if (!overridePath || !fsExistsSync(overridePath)) {
            overridePath = path.resolve(pluginsPath, dir, 'overrides.json');
        }

        const overrideConfig = overridePath ? readObjectSync<ConfigFileOverrides>(overridePath) : null;
        const overrides = overrideConfig?.overrides;

        if (overrides) {
            Object.keys(overrides).forEach((k) => {
                const ovDir = path.join(dest, k);
                const override = overrides[k];

                if (fsExistsSync(ovDir)) {
                    if (fsLstatSync(ovDir).isDirectory()) {
                        logWarning('overrides.json: Directories not supported yet. Specify path to actual file.');
                    } else {
                        overrideFileContents(ovDir, override, overridePath, k);
                    }
                }
            });
        }
    });
};

const _applyOverrideFiles = (source: string, dest: string, dir: string) => {
    const overrideDir = _ensureOverrideDirExists();
    const appliedOverrideFilePath = path.join(overrideDir, RnvFileName.appliedOverride);
    const appliedOverrides = _readAppliedOverrides(appliedOverrideFilePath);
    const overrideFiles = _getFilesInDirectory(source);
    overrideFiles.forEach((file) => {
        const relativeFilePath = path.relative(source, file);
        const destFilePath = path.join(dest, relativeFilePath);
        const fileKey = path.relative(dest, destFilePath);
        const packageVersion = _getCurrentPackageVersion(dir);
        const newFileHash = _generateChecksum(fsReadFileSync(file).toString());
        if (fsExistsSync(destFilePath)) {
            _backupOriginalFile(destFilePath, overrideDir, dir, fileKey);
        }
        const currentOverride = appliedOverrides[dir] || {};
        const existingFileHash = currentOverride[fileKey];
        if (newFileHash !== existingFileHash) {
            appliedOverrides[dir] = appliedOverrides[dir] || {};
            appliedOverrides[dir][fileKey] = newFileHash;
            appliedOverrides[dir].version = packageVersion;
            _writeAppliedOverrides(appliedOverrides, appliedOverrideFilePath);
            fsCopyFileSync(file, destFilePath);
        }
    });

    logInfo(`${chalk.gray(dest)} overriden by: ${chalk.gray(source.split('node_modules').pop())}`);
};

export const overrideFileContents = (
    dest: string,
    override: Record<string, string>,
    overridePath = '',
    fileKey: string
) => {
    const overrideDir = _ensureOverrideDirExists();
    const appliedOverrideFilePath = path.join(overrideDir, RnvFileName.appliedOverride);

    const appliedOverrides = _readAppliedOverrides(appliedOverrideFilePath);

    if (fsExistsSync(dest)) {
        let fileToFix = fsReadFileSync(dest).toString();
        const { backupPath, isFirstRun } = _saveOriginalFile(dest, overrideDir);
        const packageName = _getPackageName(dest, fileKey);
        const previousOverride = appliedOverrides[packageName]?.[fileKey] || {};
        const packageVersion = _getCurrentPackageVersion(packageName);

        const overridesChanged = JSON.stringify(previousOverride) !== JSON.stringify(override);
        if (overridesChanged && !isFirstRun) {
            revertOverrideToOriginal(dest, backupPath);
            fileToFix = fsReadFileSync(dest).toString();
        }
        let foundRegEx = false;
        const failTerms: Array<string> = [];

        Object.keys(override).forEach((fk) => {
            const originalRegEx = new RegExp(`${getCleanRegExString(fk)}`, 'g');
            const overrideRegEx = new RegExp(`${getCleanRegExString(override[fk])}`, 'g');
            const originalExists = originalRegEx.test(fileToFix);
            const overrideExists = overrideRegEx.test(fileToFix);

            if (originalExists && !overrideExists) {
                foundRegEx = true;
                if (override[fk].startsWith('\n')) {
                    fileToFix = fileToFix.replace(originalRegEx, `${fk}${override[fk]}`);
                } else {
                    fileToFix = fileToFix.replace(originalRegEx, `${override[fk]}`);
                }

                logSuccess(
                    `${chalk.bold.white(dest)} requires override by: ${chalk.bold.white(
                        overridePath.split('node_modules').pop()
                    )}. FIXING...DONE`
                );
            } else if (overrideExists) {
                if (originalExists) {
                    if (fk.includes(override[fk])) {
                        foundRegEx = true;
                        fileToFix = fileToFix.replace(originalRegEx, `${override[fk]}`);
                        logSuccess(
                            `${chalk.bold.white(dest)} requires override by: ${chalk.bold.white(
                                overridePath.split('node_modules').pop()
                            )}. FIXING...DONE`
                        );
                    } else {
                        logInfo(
                            `${chalk.gray(dest)} overridden by: ${chalk.gray(overridePath.split('node_modules').pop())}`
                        );
                    }
                } else {
                    logInfo(
                        `${chalk.gray(dest)} overridden by: ${chalk.gray(overridePath.split('node_modules').pop())}`
                    );
                }
            } else {
                failTerms.push(fk);
            }
        });

        if (!foundRegEx) {
            if (overridePath !== 'REACT_CORE_OVERRIDES') {
                failTerms.forEach((term) => {
                    logWarning(
                        `No Match found in ${chalk.red(
                            dest.split('node_modules').pop()
                        )} for expression: ${chalk.gray(term)}. Source: ${chalk.bold.white(
                            overridePath.split('node_modules').pop()
                        )}`
                    );
                });
            }
            // return;
        }
        if (overridesChanged) {
            appliedOverrides[packageName] = appliedOverrides[packageName] || {};
            appliedOverrides[packageName][fileKey] = override;
            appliedOverrides[packageName].version = packageVersion;
            fsWriteFileSync(dest, fileToFix);
            _writeAppliedOverrides(appliedOverrides, appliedOverrideFilePath);
        } else if (foundRegEx) {
            fsWriteFileSync(dest, fileToFix);
        }
    } else {
        logDebug(`overrideFileContents Warning: path does not exist ${dest}`);
    }
};
const _generateChecksum = (content: string) => {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
};
const _getCurrentPackageVersion = (packageName: string) => {
    const rootPath = _getRootPath();
    const packageJsonPath = path.join(rootPath, 'node_modules', packageName, RnvFileName.package);
    if (fsExistsSync(packageJsonPath)) {
        const packageContent = JSON.parse(fsReadFileSync(packageJsonPath).toString());
        return packageContent.version;
    }
    return '';
};
const _backupOriginalFile = (filePath: string, overrideDir: string, dir: string, relativeFilePath: string) => {
    const backupFilePath = path.join(overrideDir, dir, relativeFilePath);

    if (!fsExistsSync(backupFilePath)) {
        const backupFileDir = path.dirname(backupFilePath);
        if (!fsExistsSync(backupFileDir)) {
            fs.mkdirSync(backupFileDir, { recursive: true });
        }
        fsCopyFileSync(filePath, backupFilePath);
    }
};

const _getFilesInDirectory = (dir: string) => {
    let files: string[] = [];
    fsReaddirSync(dir).forEach((file) => {
        const fullPath = path.join(dir, file);
        if (fsStatSync(fullPath).isDirectory()) {
            files = files.concat(_getFilesInDirectory(fullPath));
        } else {
            files.push(fullPath);
        }
    });
    return files;
};
const _getRootPath = () => {
    const c = getContext();
    const isMonorepo = getConfigRootProp('isMonorepo');
    return path.join(isMonorepo ? path.join(c.paths.project.dir, '../..') : c.paths.project.dir, '');
};

const _getPackageName = (dest: string, fileKey: string): string => {
    const nodeModulesIndex = dest.indexOf('node_modules');
    if (nodeModulesIndex === -1) {
        throw new Error('File path does not contain node_modules.');
    }
    const relativePath = dest.slice(nodeModulesIndex + 'node_modules'.length + 1);
    const packageName = relativePath.replace(`/${fileKey}`, '');

    return packageName;
};
const _saveOriginalFile = (dest: string, overrideDir: string) => {
    const nodeModulesIndex = dest.indexOf('node_modules');
    let isFirstRun = false;
    if (nodeModulesIndex === -1) {
        throw new Error('File path does not contain node_modules.');
    }
    const relativePathFromNodeModules = dest.substring(nodeModulesIndex + 'node_modules'.length);
    const backupPath = path.join(overrideDir, relativePathFromNodeModules);
    const buckupDir = path.dirname(backupPath);
    if (!fsExistsSync(buckupDir)) {
        fs.mkdirSync(buckupDir, { recursive: true });
    }

    if (!fsExistsSync(backupPath)) {
        fsCopyFileSync(dest, backupPath);
        isFirstRun = true;
    }
    return { backupPath, isFirstRun };
};

const _readBackupContent = (backupPath: string): string => {
    if (fsExistsSync(backupPath)) {
        return fsReadFileSync(backupPath).toString();
    }
    return '';
};

const _readAppliedOverrides = (apliedOverrideFilePath: string) => {
    if (fsExistsSync(apliedOverrideFilePath)) {
        return JSON.parse(fsReadFileSync(apliedOverrideFilePath).toString());
    }
    return {};
};

const _writeAppliedOverrides = (appliedOverrides: Record<string, string>, apliedOverrideFilePath: string) => {
    fsWriteFileSync(apliedOverrideFilePath, JSON.stringify(appliedOverrides, null, 2), 'utf8');
};

const _ensureOverrideDirExists = () => {
    const c = getContext();
    const isMonorepo = getConfigRootProp('isMonorepo');
    const overrideDir = isMonorepo
        ? path.join(c.paths.project.dir, '../../.rnv', 'overrides')
        : path.join(c.paths.project.dir, '.rnv', 'overrides');

    if (!fsExistsSync(overrideDir)) {
        fsMkdirSync(overrideDir);
    }
    return overrideDir;
};
export const revertOverrideToOriginal = (filePath: string, backupPath: string) => {
    const originalContent = _readBackupContent(backupPath);
    if (originalContent) {
        fsWriteFileSync(filePath, originalContent);
        logInfo(`Reverted ${filePath} to its original state.`);
    } else {
        logWarning(`No original file found to revert for ${filePath}.`);
    }
};
const _findAllNodeModules = (dir: string) => {
    const nodeModulesPaths: string[] = [];
    const searchNodeModules = (currentDir: string) => {
        const nodeModulesDir = path.join(currentDir, 'node_modules');
        if (fsExistsSync(nodeModulesDir)) {
            nodeModulesPaths.push(nodeModulesDir);
            fs.readdirSync(nodeModulesDir).forEach((subDir) => {
                const subDirPath = path.join(nodeModulesDir, subDir);
                if (fsLstatSync(subDirPath).isDirectory()) {
                    searchNodeModules(subDirPath);
                }
            });
        }
    };
    searchNodeModules(dir);
    return nodeModulesPaths;
};

const _getPluginConfiguration = (c: RnvContext, pluginName: string) => {
    let renativePlugin: ConfigFilePlugin | undefined;
    let renativePluginPath;
    try {
        renativePluginPath = require.resolve(`${pluginName}/renative.plugin.json`, { paths: [c.paths.project.dir] });
    } catch {
        //
    }

    if (renativePluginPath) {
        renativePlugin = readObjectSync<ConfigFilePlugin>(renativePluginPath) || undefined;
    }
    return renativePlugin;
};

export const checkForPluginDependencies = async (postInjectHandler?: AsyncCallback) => {
    const c = getContext();

    const toAdd: Record<string, string> = {};
    if (!c.buildConfig.plugins) return;

    const bcPlugins = c.buildConfig.plugins;

    Object.keys(c.buildConfig.plugins).forEach((pluginName) => {
        const renativePluginConfig = _getPluginConfiguration(c, pluginName);

        if (renativePluginConfig) {
            c._renativePluginCache[pluginName] = renativePluginConfig;
        }

        const pluginDeps = renativePluginConfig?.pluginDependencies;
        if (pluginDeps) {
            // we have dependencies for this plugin
            Object.keys(pluginDeps).forEach((p) => {
                const plg = bcPlugins[pluginName];
                if (!bcPlugins[p] && typeof plg !== 'string' && plg.pluginDependencies?.[p] !== null) {
                    logWarning(`Plugin ${p} is not installed yet.`);
                    const pluginDep = pluginDeps[p];
                    if (pluginDep) {
                        toAdd[p] = pluginDep;
                        bcPlugins[p] = pluginDep;
                    }
                }
            });
        }
    });

    if (Object.keys(toAdd).length) {
        // ask the user
        let install = false;
        if (!c.program.opts().ci) {
            const answer = await inquirerPrompt({
                type: 'confirm',
                message: `Install ${Object.keys(toAdd).join(', ')}?`,
                warningMessage: `One or more dependencies are not installed: ${chalk.bold.white(
                    Object.keys(toAdd).join(', ')
                )}`
            });
            install = answer.confirm;
        } else {
            logWarning('CI detected. Automatically installing dependencies');
            install = true;
        }

        if (install && c.files.project.config_original) {
            c.files.project.config_original.plugins = {
                ...(c.files.project.config_original.plugins || {}),
                ...toAdd
            };
            writeRenativeConfigFile(c.paths.project.config, c.files.project.config_original);
            // Need to reload merged files
            await parseRenativeConfigs();
            await configurePlugins();
            if (postInjectHandler) {
                await postInjectHandler();
            }
        }
    }
};

// const getPluginPlatformFromString = (p: string): RnvPluginPlatform => p as RnvPluginPlatform;

export const overrideTemplatePlugins = async () => {
    logDefault('overrideTemplatePlugins');

    const c = getContext();
    const { skipOverridesCheck } = c.program.opts();
    if (skipOverridesCheck) {
        logInfo(`Plugin overrides will not be applied because --skipOverridesCheck parameter was passed.`);
        return true;
    }
    const rnvPluginsDirs = c.paths.scopedConfigTemplates.pluginTemplatesDirs;
    const appPluginDirs = c.paths.appConfig.pluginDirs;

    parsePlugins((plugin, _pluginPlat, key) => {
        if (!plugin.disablePluginTemplateOverrides) {
            if (plugin?._scopes?.length) {
                plugin._scopes.forEach((pluginScope) => {
                    const pluginOverridePath = rnvPluginsDirs[pluginScope];
                    if (pluginOverridePath) {
                        _overridePlugin(c, pluginOverridePath, key);
                    }
                });
            }
            if (appPluginDirs) {
                for (let k = 0; k < appPluginDirs.length; k++) {
                    _overridePlugin(c, appPluginDirs[k], key);
                }
            }
        } else {
            logInfo(
                `Plugin overrides disabled for: ${chalk.bold.white(key)} with disablePluginTemplateOverrides. SKIPPING`
            );
        }
    }, true);
    return true;
};

export const copyTemplatePluginsSync = (c: RnvContext) => {
    const destPath = path.join(getAppFolder());

    logDefault('copyTemplatePluginsSync', `(${destPath})`);

    parsePlugins((plugin, pluginPlat, key) => {
        const objectInject: OverridesOptions = [...c.configPropsInjects];
        if (plugin.props) {
            Object.keys(plugin.props).forEach((v) => {
                objectInject.push({
                    pattern: `{{props.${v}}}`,
                    override: plugin.props?.[v]
                });
            });
        }

        // FOLDER MERGES FROM PROJECT CONFIG PLUGIN
        const sourcePath3 = getAppConfigBuildsFolder(path.join(c.paths.project.appConfigBase.dir, `plugins/${key}`));
        copyFolderContentsRecursiveSync(sourcePath3, destPath, true, undefined, false, objectInject);

        // FOLDER MERGES FROM PROJECT CONFIG PLUGIN (PRIVATE)
        const sourcePath3sec = getAppConfigBuildsFolder(
            path.join(c.paths.workspace.project.appConfigBase.dir, `plugins/${key}`)
        );
        copyFolderContentsRecursiveSync(sourcePath3sec, destPath, true, undefined, false, objectInject);

        // FOLDER MERGES FROM APP CONFIG PLUGIN
        const sourcePath2 = getAppConfigBuildsFolder(path.join(c.paths.appConfig.dir, `plugins/${key}`));
        copyFolderContentsRecursiveSync(sourcePath2, destPath, true, undefined, false, objectInject);

        // FOLDER MERGES FROM APP CONFIG PLUGIN (PRIVATE)
        const sourcePath2sec = getAppConfigBuildsFolder(path.join(c.paths.workspace.appConfig.dir, `plugins/${key}`));
        copyFolderContentsRecursiveSync(sourcePath2sec, destPath, true, undefined, false, objectInject);

        // FOLDER MERGES FROM SCOPED PLUGIN TEMPLATES
        // NOTE: default 'rnv' scope (@rnv/config-templates) is included in pluginTemplatesDirs
        Object.keys(c.paths.scopedConfigTemplates.pluginTemplatesDirs).forEach((pathKey) => {
            const pluginTemplatePath = c.paths.scopedConfigTemplates.pluginTemplatesDirs[pathKey];
            const sourcePath4sec = getAppConfigBuildsFolder(path.join(pluginTemplatePath, key));
            copyFolderContentsRecursiveSync(sourcePath4sec, destPath, true, undefined, false, objectInject);
        });
    });
};

export const sanitizePluginPath = (str: string, name: string, mandatory?: boolean, options?: ResolveOptions) => {
    try {
        return str.replace('{{PLUGIN_ROOT}}', doResolve(name, mandatory, options) || '');
    } catch {}
    return str;
};

export const includesPluginPath = (str?: string) => !!str?.includes('{{PLUGIN_ROOT}}');

export const getLocalRenativePlugin = () => ({
    version: 'file:../packages/renative',
    webpack: {
        modulePaths: [],
        moduleAliases: {
            renative: {
                projectPath: 'packages/renative'
            }
        }
    }
});

export const updateRenativeConfigs = async () => {
    await loadPluginTemplates();
    await parseRenativeConfigs();
    return true;
};
