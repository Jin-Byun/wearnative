import type { ChildProcess, SpawnOptions } from 'node:child_process';
import path from 'node:path';
import {
    chalk,
    createTask,
    executeAsync,
    fsExistsSync,
    fsReaddirSync,
    inquirerPrompt,
    isSystemWin,
    logDebug,
    logToSummary,
    RnvTaskName,
    removeDirs
} from '@rnv/core';

async function clearWindowsCacheFiles() {
    // TODO using executeAsync for these scripts returns an error, so this is just a temporary workaround
    // This should resolve as it used internally by @react-native-community/cli
    const { spawn } = await import('node:child_process');
    const opts = {
        detached: false,
        stdio: 'ignore'
    } as SpawnOptions;
    // NuGet cache
    const nuget = spawn('cmd.exe', ['/C', 'dotnet nuget locals all --clear'], opts);
    // Yarn/NPM cache
    const npm = spawn('cmd.exe', ['/C', 'npm cache clean --force & yarn cache clean --all'], opts);
    // Watchman cache
    const watchman = spawn('cmd.exe', ['/C', 'watchman watch-del-all'], opts);

    const childProcesses: ChildProcess[] = [nuget, npm, watchman];

    const tempDir = process.env.TEMP;
    if (tempDir) {
        // Temporary cache files located in C:/Users/<UserName>/AppData/Local/Temp
        const tmp = spawn('cmd.exe', ['/C', 'del /q/f/s %TEMP%\\*'], opts);
        childProcesses.push(tmp);
    }
    await Promise.all(
        childProcesses.map((cp) => {
            return new Promise((res) => {
                cp.on('close', () => {
                    res('done');
                });
                cp.on('error', () => {
                    res('script aborted');
                });
            });
        })
    );

    return true;
}

export default createTask({
    description: 'Automatically removes all node_modules and lock in your project and its dependencies',
    fn: async ({ ctx }) => {
        const skipQuestion = ctx.program.opts().ci;
        const pathsToRemove = [];
        const localFiles = [];
        const immediateNodeModuleDir = path.join(ctx.paths.project.dir, 'node_modules');

        const pkgLock = path.join(ctx.paths.project.dir, 'package-lock.json');

        if (fsExistsSync(immediateNodeModuleDir)) {
            pathsToRemove.push(immediateNodeModuleDir);
        }
        if (fsExistsSync(pkgLock)) pathsToRemove.push(pkgLock);

        const yarnLock = path.join(ctx.paths.project.dir, 'yarn.lock');
        if (fsExistsSync(yarnLock)) {
            pathsToRemove.push(yarnLock);
        }

        const packagesFolder = path.join(ctx.paths.project.dir, 'packages');
        if (fsExistsSync(packagesFolder)) {
            fsReaddirSync(packagesFolder).forEach((dir) => {
                if (dir === '.DS_Store') {
                    const pth = path.join(packagesFolder, dir);

                    if (fsExistsSync(pth)) {
                        pathsToRemove.push(pth);
                    }
                } else {
                    const pth2 = path.join(packagesFolder, dir, 'node_modules');
                    if (fsExistsSync(pth2)) {
                        pathsToRemove.push(pth2);
                    }

                    const pth3 = path.join(packagesFolder, dir, 'package-lock.json');
                    if (fsExistsSync(pth3)) {
                        pathsToRemove.push(pth3);
                    }

                    const pth4 = path.join(packagesFolder, dir, 'yarn.lock');
                    if (fsExistsSync(pth4)) {
                        pathsToRemove.push(pth4);
                    }

                    const pth5 = path.join(packagesFolder, dir, 'dist');
                    if (fsExistsSync(pth5)) {
                        pathsToRemove.push(pth5);
                    }
                }
            });
        }

        const buildDirs = [];
        if (fsExistsSync(ctx.paths.project.builds.dir)) {
            buildDirs.push(ctx.paths.project.builds.dir);
        }
        if (fsExistsSync(ctx.paths.project.assets.dir)) {
            buildDirs.push(ctx.paths.project.assets.dir);
        }

        const local1 = path.join(ctx.paths.project.dir, '.DS_Store');
        if (fsExistsSync(local1)) localFiles.push(local1);
        const local2 = path.join(ctx.paths.project.dir, 'renative.local.json');
        if (fsExistsSync(local2)) localFiles.push(local2);
        const local3 = path.join(ctx.paths.project.dir, 'metro.config.local.js');
        if (fsExistsSync(local3)) localFiles.push(local3);

        const answers = {
            modules: false,
            builds: false,
            cache: false,
            platformBuilds: false,
            platformAssets: false,
            distAndLib: false,
            gitIgnore: false,
            nothingToClean: !skipQuestion,
            locals: false
        };

        if (skipQuestion) {
            answers.modules = true;
            answers.builds = true;
            answers.cache = true;
            answers.locals = true;
        } else {
            if (pathsToRemove.length) {
                answers.modules = (await inquirerPrompt({
                    name: 'confirm',
                    type: 'confirm',
                    message: `Do you want to remove node_module related files/folders? \n${chalk.red(
                        pathsToRemove.join('\n')
                    )}`
                })) as boolean;
            }
            if (buildDirs.length) {
                answers.builds = (await inquirerPrompt({
                    name: 'confirmBuilds',
                    type: 'confirm',
                    message: `Do you want to clean your platformBuilds and platformAssets? \n${chalk.red(
                        buildDirs.join('\n')
                    )}`
                })) as boolean;
            }

            if (localFiles.length) {
                answers.locals = (await inquirerPrompt({
                    name: 'confirmLocals',
                    type: 'confirm',
                    message: `Do you want to clean local files? \n${chalk.red(localFiles.join('\n'))}`
                })) as boolean;
            }

            answers.cache = (await inquirerPrompt({
                name: 'confirmCache',
                type: 'confirm',
                message: 'Do you want to clean your platformBuilds and/or npm/bundler cache?'
            })) as boolean;
            answers.nothingToClean = !['cache', 'locals', 'builds', 'modules'].some(
                (k) => answers[k as keyof typeof answers]
            );
        }

        if (answers.nothingToClean) {
            logToSummary('Nothing to clean');
            return true;
        }

        if (answers.modules) {
            await removeDirs(pathsToRemove);
        }
        if (answers.builds) {
            await removeDirs(buildDirs);
        }
        if (answers.locals) {
            await removeDirs(localFiles);
        }
        if (answers.cache) {
            if (isSystemWin) {
                await clearWindowsCacheFiles();
            } else {
                try {
                    await executeAsync('watchman watch-del-all');
                } catch {
                    logDebug('watchman not installed. skipping');
                }

                await executeAsync(
                    'npx rimraf -I $TMPDIR/metro-* && npx rimraf -I $TMPDIR/react-* && npx rimraf -I $TMPDIR/haste-*'
                );
            }
        }
        return true;
    },
    task: RnvTaskName.clean,
    isGlobalScope: true
});
