import path from 'node:path';
import {
    type ConfigFileEngine,
    executeAsync,
    fsExistsSync,
    getContext,
    getFilteredEngines,
    getMergedPlugin,
    getPacManCommand,
    getScopedVersion,
    inquirerPrompt,
    type RnvEngineInstallConfig,
    RnvFileName,
    type RnvPlatformKey,
    type RnvPlugin,
    readObjectSync,
    writeFileSync
} from '@rnv/core';
import type { NewProjectData } from '../types';

const _mergeDependencies = (target: Record<string, string>, source?: Record<string, string>) => {
    if (source) {
        Object.keys(source).forEach((dep) => {
            if (!target[dep]) {
                target[dep] = source[dep];
            }
        });
    }
};

const _isPluginRequired = (plugin: RnvPlugin, supportedPlatforms: Array<RnvPlatformKey>) => {
    if (!plugin.supportedPlatforms) return true;
    return plugin.supportedPlatforms.some((platform) => supportedPlatforms.includes(platform));
};
const Question = async (data: NewProjectData) => {
    const c = getContext();
    if (!fsExistsSync(c.paths.project.config)) return;

    const confirmInstallEngines = (await inquirerPrompt({
        name: 'confirmInstallEngines',
        type: 'confirm',
        message: 'You do not have any engines installed. Do you want to install them now?'
    })) as boolean;
    if (!confirmInstallEngines) return;

    const filteredEngines: Record<string, string> = getFilteredEngines(c);
    const pkg = c.files.project.package;
    const devDeps = pkg.devDependencies || {};
    const deps = pkg.dependencies || {};
    pkg.devDependencies = devDeps;
    pkg.dependencies = deps;
    const supportedPlatforms = data?.inputs?.supportedPlatforms;

    const enginesToInstall: Array<RnvEngineInstallConfig> = Object.entries(filteredEngines).flatMap(([k, v]) => {
        const engVersion = getScopedVersion(c, k, v, 'engineTemplates');
        if (!engVersion) return [];
        return {
            key: k,
            version: engVersion
        };
    });

    const cwd = c.paths.project.dir;
    const nmDir = path.join(cwd, 'node_modules');
    for (const { key, version } of enginesToInstall) {
        if (!key || !version) continue;

        await executeAsync(`${getPacManCommand(c)} ${key}@${version} --dev`, {
            cwd
        });
        devDeps[key] = version;

        if (!supportedPlatforms) continue;

        const engineConfigPath = path.join(nmDir, key, RnvFileName.renativeEngine);
        const engineConfig = readObjectSync<ConfigFileEngine>(engineConfigPath);
        if (!engineConfig) continue;
        for (const plat of supportedPlatforms) {
            const npmDeps = engineConfig.platforms?.[plat]?.npm;
            if (npmDeps) {
                _mergeDependencies(deps, npmDeps.dependencies);
                _mergeDependencies(devDeps, npmDeps.devDependencies);
            }
        }
        if (engineConfig?.npm) {
            _mergeDependencies(deps, engineConfig.npm.dependencies);
            _mergeDependencies(devDeps, engineConfig.npm.devDependencies);
        }
    }

    const { plugins } = c.buildConfig;

    if (plugins) {
        for (const k of Object.keys(plugins)) {
            const plugin = getMergedPlugin(c, k);
            if (deps[k]) continue;
            if (!plugin?.version) continue;
            if (!supportedPlatforms) continue;
            if (
                plugin.disabled === true ||
                plugin.disableNpm === true ||
                !_isPluginRequired(plugin, supportedPlatforms)
            )
                continue;

            deps[k] = plugin.version;
        }
    }
    writeFileSync(c.paths.project.package, c.files.project.package);
};

export default Question;
