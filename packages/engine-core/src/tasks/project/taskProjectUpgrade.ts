import fs from 'node:fs';
import path from 'node:path';
import {
    type ConfigFileProject,
    createTask,
    executeTask,
    fsExistsSync,
    listAndSelectNpmVersion,
    logInfo,
    logToSummary,
    type NpmPackageFile,
    RnvFileName,
    RnvTaskName,
    readObjectSync,
    upgradeDependencies,
    upgradeProjectDependencies
} from '@rnv/core';
import { installPackageDependenciesAndPlugins } from '../../taskHelpers';

export default createTask({
    description: 'Upgrade or downgrade RNV dependencies in your ReNative project',
    fn: async ({ ctx, taskName, originTaskName }) => {
        const { paths, files } = ctx;
        if (fsExistsSync(paths.project.config)) {
            await executeTask({ taskName: RnvTaskName.projectConfigure, parentTaskName: taskName, originTaskName });
            const selectedVersion = await listAndSelectNpmVersion('rnv');
            const upgradedPaths = upgradeProjectDependencies(selectedVersion);

            await installPackageDependenciesAndPlugins();
            logToSummary(`Upgraded following files:\n${upgradedPaths.join('\n')}`);
            return true;
        }

        logInfo('Your are running rnv upgrade outside of renative project');
        const packagesPath = path.join(paths.project.dir, 'packages');
        if (!fsExistsSync(paths.project.package) || !fsExistsSync(packagesPath)) return true;

        const selectedVersion = await listAndSelectNpmVersion('rnv');
        const upgradedPaths = upgradeDependencies(
            files.project.package,
            paths.project.package,
            undefined,
            null,
            selectedVersion
        ).concat(
            fs.readdirSync(packagesPath).flatMap((dir) => {
                const dirPath = path.join(packagesPath, dir);
                if (!fs.statSync(dirPath).isDirectory()) return [];

                const pkgPath = path.join(dirPath, RnvFileName.package);
                const rnvPath = path.join(dirPath, RnvFileName.renative);
                const pkgFile = readObjectSync<NpmPackageFile>(pkgPath);
                const rnvFile = readObjectSync<ConfigFileProject>(rnvPath);
                if (!pkgFile || !rnvFile) return [];

                return upgradeDependencies(pkgFile, pkgPath, rnvFile, rnvPath, selectedVersion);
            })
        );

        logToSummary(`Upgraded following files:\n${upgradedPaths.join('\n')}`);
        return true;
    },
    task: RnvTaskName.projectUpgrade,
    isGlobalScope: true
});
