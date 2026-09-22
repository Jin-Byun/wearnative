import path from 'node:path';
import { inquirerPrompt } from '../api';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { logDebug, logDefault, logError, logInfo, logSuccess, logWarning } from '../logger';
import { commandExistsSync, executeAsync } from '../system/exec';
import { fsExistsSync, removeDirs, writeFileSync } from '../system/fs';
import { doResolve } from '../system/resolve';
import { handleMutations } from './mutations';
import { isOfflineMode } from './utils';

export const checkIfProjectAndNodeModulesExists = async () => {
    logDefault('checkIfProjectAndNodeModulesExists');

    const c = getContext();

    if (c.paths.project.configExists && !fsExistsSync(c.paths.project.nodeModulesDir)) {
        c._requiresNpmInstall = false;
        logInfo('node_modules folder is missing. INSTALLING...');
        await installPackageDependencies();
    }
};

export const checkNpxIsInstalled = async () => {
    logDefault('checkNpxIsInstalled');
    if (!commandExistsSync('npx')) {
        logWarning('npx is not installed, please install it before running this command');

        const { confirm } = await inquirerPrompt({
            type: 'confirm',
            message: 'Do you want to install npx it now?'
        });

        if (confirm) {
            await executeAsync('npm install -g npx');
            return true;
        }

        throw new Error('npx is not installed');
    }
};

export const areNodeModulesInstalled = () => !!doResolve('resolve', false);

type NpmVersion = { name: string; value: string };

export const listAndSelectNpmVersion = async (npmPackage: string) => {
    const templateVersionsStr = await executeAsync(`npm view ${npmPackage} versions`);
    const versionArr = templateVersionsStr.replace(/\r?\n|\r|\s|'|\[|\]/g, '').split(',');

    const templateTagsStr = await executeAsync(`npm dist-tag ls ${npmPackage}`);
    const tagArr: Array<{
        name: string;
        version: string;
    }> = [];
    templateTagsStr.split('\n').forEach((tString) => {
        const tArr = tString.split(': ');
        tagArr.push({
            name: tArr[0],
            version: tArr[1]
        });
    });

    versionArr.reverse();
    const validVersions: NpmVersion[] = versionArr.map((v: string) => ({ name: v, value: v }));

    let [recommendedVersion] = validVersions;
    const validVersionsStandard: NpmVersion[] = [];
    const validVersionsHead: NpmVersion[] = [];
    for (const item of validVersions) {
        let matchStr = '';
        const matchArr: Array<string> = [];
        for (const tag of tagArr) {
            if (tag.version === item.value) {
                matchArr.push(tag.name);
            }
        }
        if (!matchArr.length) {
            validVersionsStandard.push(item);
            continue;
        }
        matchStr = ` (@${matchArr.join(', ')})`;
        item.name = `${item.value}${matchStr}`;
        if (matchArr[0] === 'latest') {
            recommendedVersion = item;
        }
        validVersionsHead.push(item);
    }

    const validVersionsCombined = validVersionsHead.concat(validVersionsStandard);

    const { inputTemplateVersion } = await inquirerPrompt({
        name: 'inputTemplateVersion',
        type: 'list',
        message: `What ${npmPackage} version to use?`,
        default: recommendedVersion.value,
        loop: false,
        choices: validVersionsCombined
    });

    return inputTemplateVersion;
};

const _getInstallScript = (c: RnvContext) => {
    const tasks = c.buildConfig?.tasks;
    if (!tasks) return null;
    if (!Array.isArray(tasks)) {
        return tasks.install?.script;
    }
    return tasks.find((task) => task.name === 'install')?.script ?? null;
};

export const isYarnInstalled = () => commandExistsSync('yarn') || doResolve('yarn', false);

export const isPnpmInstalled = () => commandExistsSync('pnpm') || doResolve('pnpm', false);

export const checkAndInstallPackageDependenciesIfRequired = async () => {
    const ctx = getContext();

    if (ctx.mutations.pendingMutations.length > 0) {
        await installPackageDependencies();
    }
};

export const installPackageDependencies = async (failOnError = false) => {
    const c = getContext();
    const result = await handleMutations(c);

    if (!result) {
        c._requiresNpmInstall = false;
        return;
    }
    if (isOfflineMode('install package dependencies')) {
        return;
    }

    c.runtime.forceBuildHookRebuild = true;
    const customScript = _getInstallScript(c);

    if (customScript) {
        logDefault('installPackageDependencies');
        logInfo(`Found custom task for install: ${customScript}.`);
        await executeAsync(customScript);
        c._requiresNpmInstall = false;
        return true;
    }

    const { isMonorepo } = c.buildConfig;
    if (isMonorepo) {
        logSuccess(
            'This project is marked as part of monorepo and it has no custom install tasks. Run your usual monorepo bootstrap procedure and re-run command again.'
        );
        return Promise.reject('Cancelled');
    }

    const pnpmLockPath = path.join(c.paths.project.dir, 'pnpm-lock.yaml');
    const npmLockPath = path.join(c.paths.project.dir, 'package-lock.json');
    let command = 'npm install';

    const pnpmLockExists = fsExistsSync(pnpmLockPath);
    const packageLockExists = fsExistsSync(npmLockPath);

    if (pnpmLockExists || packageLockExists) {
        // a lock file exists, defaulting to whichever is present
        if (pnpmLockExists && !isPnpmInstalled())
            throw new Error(
                "You have a pnpm-lock.yaml file but you don't have pnpm installed. Install it or delete pnpm-lock.yaml"
            );
        command = pnpmLockPath ? 'pnpm install' : 'npm install';
    } else if (c.program.opts().packageManager) {
        // no lock file check cli option
        if (['pnpm', 'npm'].includes(c.program.opts().packageManager)) {
            command = c.program.opts().packageManager === 'pnpm' ? 'pnpm install' : 'npm install';
            if (command === 'pnpm' && !isPnpmInstalled())
                throw new Error("You specified pnpm as packageManager but it's not installed");
        } else {
            throw new Error(
                `Unsupported package manager ${
                    c.program.opts().packageManager
                }. Only pnpm and npm are supported at the moment.`
            );
        }
    } else {
        // no cli option either, asking
        const { packageManager } = await inquirerPrompt({
            type: 'list',
            name: 'packageManager',
            message: 'What package manager would you like to use?',
            choices: ['pnpm', 'npm'],
            default: 'npm'
        });
        if (packageManager === 'pnpm') command = 'pnpm install';
    }

    logDefault('installPackageDependencies', `packageManager:(${command})`);

    try {
        await executeAsync(command);
    } catch (e) {
        if (failOnError) {
            logError(e);
            throw e;
        }
        logWarning(
            `${e}\n Seems like your node_modules is corrupted by other libs. ReNative will try to fix it for you`
        );
        try {
            // TODO: evalauate if this is still needed
            await cleanNodeModules();
            await installPackageDependencies(true);
        } catch (npmErr) {
            logError(npmErr);
            throw npmErr;
        }
    }
    try {
        const plats = c.files.project.config?.defaults?.supportedPlatforms;
        if (Array.isArray(plats) && plats.includes('androidwear')) {
            if (!c.files.project.configLocal) {
                c.files.project.configLocal = {};
            }
            if (!c.files.project.configLocal?._meta) {
                c.files.project.configLocal._meta = {};
            }
            c.files.project.configLocal._meta.requiresJetify = true;
            writeFileSync(c.paths.project.configLocal, c.files.project.configLocal);
        }
        c._requiresNpmInstall = false;
        return true;
    } catch (jetErr) {
        logError(jetErr);
        return false;
    }
};

export const cleanNodeModules = () =>
    new Promise<void>((resolve, reject) => {
        logDefault('cleanNodeModules');
        const dirs = [
            'react-native-safe-area-view/.git',
            '@react-navigation/native/node_modules/react-native-safe-area-view/.git',
            'react-navigation/node_modules/react-native-safe-area-view/.git',
            'react-native-safe-area-view/.git',
            '@react-navigation/native/node_modules/react-native-safe-area-view/.git',
            'react-navigation/node_modules/react-native-safe-area-view/.git'
        ].reduce<Array<string>>((acc, dir) => {
            const res = dir.match(/([^/]+)\/(.*)/);
            if (res) {
                const [_all, aPackage, aPath] = res;
                logDebug(`Cleaning: ${_all}`);
                const resolved = doResolve(aPackage, false);
                if (resolved) {
                    acc.push(`${resolved}/${aPath}`);
                }
            }

            return acc;
        }, []);
        removeDirs(dirs)
            .then(() => resolve())
            .catch((e) => reject(e));
    });
