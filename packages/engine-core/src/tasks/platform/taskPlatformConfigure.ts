import {
    chalk,
    cleanPlatformBuild,
    configureRuntimeDefaults,
    createPlatformBuild,
    createTask,
    executeTask,
    fsExistsSync,
    getAppFolder,
    getConfigProp,
    logInfo,
    logTask,
    logWarning,
    RnvTaskName,
    // installPackageDependencies,
    // overrideTemplatePlugins,
    resolveEngineDependencies
} from '@rnv/core';
import path from 'path';
import { isBuildSchemeSupported } from '../../buildSchemes';
import { checkAndInstallIfRequired } from '../../taskHelpers';
// import { configureFonts } from '@rnv/sdk-utils';

export default createTask({
    description: 'Low-level task used by engines to prepare platformBuilds folder',
    isPrivate: true,
    dependsOn: [RnvTaskName.projectConfigure],
    fn: async ({ ctx, taskName, originTaskName }) => {
        const { program, platform } = ctx;
        await isBuildSchemeSupported();

        const entryFile = getConfigProp('entryFile');

        const dest = path.join(ctx.paths.project.dir, `${entryFile}.js`);
        if (!fsExistsSync(dest) && platform) {
            if (!entryFile) {
                logWarning(
                    `Missing ${chalk.red(entryFile)} key for ${chalk.bold.white(
                        ctx.platform
                    )} platform in your ${chalk.bold.white(ctx.paths.appConfig.config)}.`
                );
            }
        }

        await executeTask({
            taskName: RnvTaskName.sdkConfigure,
            parentTaskName: taskName,
            originTaskName,
            isOptional: true
        });

        await configureRuntimeDefaults();
        await checkAndInstallIfRequired();

        const hasBuild = fsExistsSync(ctx.paths.project.builds.dir);
        logTask('', `taskPlatformConfigure hasBuildFolderPresent:${hasBuild}`);

        if ((program.opts().reset || program.opts().resetHard) && !ctx.runtime.disableReset) {
            logInfo(
                `You passed ${chalk.bold.white(program.opts().reset ? '-r' : '-R')} argument. "${chalk.bold.white(
                    getAppFolder()
                )}" CLEANING...DONE`
            );
            await cleanPlatformBuild(ctx.platform);
        }

        await createPlatformBuild(ctx.platform);
        await resolveEngineDependencies();
        // TODO: check if this is needed or can be handled down the line
        // if not monorepo && mutations were found
        // await installPackageDependencies();
        // await overrideTemplatePlugins();
        // await configureFonts();

        // OLD STUFFF
        // await injectPlatformDependencies(
        //     async () => {
        //         await installPackageDependencies();
        //         await overrideTemplatePlugins();
        //         await configureFonts();
        //     },
        //     async () => {
        //         await installPackageDependencies();
        //         await overrideTemplatePlugins();
        //         await configureFonts();
        //     }
        // );
        // await _runCopyPlatforms(c);
        return true;
    },
    task: RnvTaskName.platformConfigure
});
