import path from 'node:path';
import type { PackageJson } from 'type-fest';
import { inquirerPrompt } from '../api';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { logDebug, logDefault, logError, logInfo, logSuccess, logWarning } from '../logger';
import { commandExistsSync, executeAsync } from '../system/exec';
import { fsExistsSync, fsReadFileSync, removeDirs } from '../system/fs';
import { doResolve } from '../system/resolve';
import { handleMutations } from './mutations';
import { isOfflineMode } from './utils';

export const checkIfProjectAndNodeModulesExists = async () => {
    logDefault('checkIfProjectAndNodeModulesExists');

    const c = getContext();
    if (!c.paths.project.configExists || fsExistsSync(c.paths.project.nodeModulesDir)) return;
    c._requiresNpmInstall = false;
    logInfo('node_modules folder is missing. INSTALLING...');
    await installPackageDependencies();
};

export const checkNpxIsInstalled = async () => {
    logDefault('checkNpxIsInstalled');
    if (!commandExistsSync('npx')) {
        logWarning('npx is not installed, please install it before running this command');

        const confirm = (await inquirerPrompt({
            type: 'confirm',
            message: 'Do you want to install npx it now?'
        })) as boolean;

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

    const inputTemplateVersion = (await inquirerPrompt({
        name: 'inputTemplateVersion',
        type: 'list',
        message: `What ${npmPackage} version to use?`,
        default: recommendedVersion.value,
        loop: false,
        choices: validVersionsCombined
    })) as string;

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

export const checkAndInstallPackageDependenciesIfRequired = async () => {
    const ctx = getContext();

    if (ctx.mutations.pendingMutations.length > 0) {
        await installPackageDependencies();
    }
};

export const isYarnInstalled = () => commandExistsSync('yarn') || doResolve('yarn', false);
export const isPnpmInstalled = () => commandExistsSync('pnpm') || doResolve('pnpm', false);
const isPacManInstalled = (pm: string) => commandExistsSync(pm) || doResolve(pm, false);

const pacManData = {
    pnpm: {
        lockfile: 'pnpm-lock.yaml',
        add: 'pnpm add',
        init: 'pnpm install'
    },
    yarn: {
        lockfile: 'yarn.lock',
        add: 'yarn add',
        init: 'yarn'
    },
    bun: {
        lockfile: 'bun.lock',
        add: 'bun add',
        init: 'bun install'
    },
    npm: {
        lockfile: 'package-lock.json',
        add: 'npm add',
        init: 'npm install'
    }
} as const;
const PacManList = Object.keys(pacManData) as (keyof PacManData)[];
type PacManData = typeof pacManData;

export const getPacManCommand = async (c: RnvContext, targetCmd: 'add' | 'init' = 'add') => {
    const packageJson: PackageJson = JSON.parse(fsReadFileSync(c.paths.project.package as string).toString());
    const { packageManager } = packageJson;
    let pm: keyof PacManData | undefined;
    if (packageManager) {
        // check packageManger field of package.json
        pm = PacManList.find((name) => packageManager.startsWith(name));
    }
    if (!pm) {
        // check for lock file
        pm = PacManList.find((name) => fsExistsSync(path.join(c.paths.project.dir, pacManData[name].lockfile)));
    }
    if (pm) {
        if (!isPacManInstalled(pm)) {
            throw new Error(
                `Your project uses ${pm} but you don't have ${pm} installed. Install it or if using other package manager, set up project for your package manager.`
            );
        }
        return pacManData[pm][targetCmd];
    }

    // no lock file check cli option
    if (c.program.opts().packageManager) {
        pm = PacManList.find((name) => name === c.program.opts().packageManager);
        if (!pm) {
            throw new Error(
                `Unsupported package manager ${
                    c.program.opts().packageManager
                }. ${PacManList.join(' | ')} are supported at the moment.`
            );
        }
    } else {
        // no cli option either, asking
        const inquiredPm = (await inquirerPrompt({
            type: 'list',
            name: 'inquiredPm',
            message: 'What package manager would you like to use?',
            choices: PacManList,
            default: 'npm' as keyof PacManData
        })) as keyof PacManData;
        pm = inquiredPm;
    }
    if (!isPacManInstalled(pm)) throw new Error(`You specified ${pm} as packageManager but it's not installed`);

    return pacManData[pm][targetCmd];
};

export const installPackageDependencies = async (failOnError = false) => {
    if (isOfflineMode('install package dependencies')) return;

    const c = getContext();
    const result = await handleMutations(c);
    if (!result) {
        c._requiresNpmInstall = false;
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
        throw new Error('Cancelled');
    }

    const command = await getPacManCommand(c);
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
    c._requiresNpmInstall = false;
    return true;
};

export const cleanNodeModules = async () => {
    logDefault('cleanNodeModules');
    const dirs = [
        ['react-native-safe-area-view', '.git'],
        ['@react-navigation', 'native/node_modules/react-native-safe-area-view/.git'],
        ['react-navigation', 'node_modules/react-native-safe-area-view/.git']
    ].flatMap(([pkg, pth]) => {
        logDebug(`Cleaning: ${pkg}/${pth}`);
        const resolved = doResolve(pkg, false);
        if (resolved) {
            return `${resolved}/${pth}`;
        }
        return [];
    });
    await removeDirs(dirs);
};
