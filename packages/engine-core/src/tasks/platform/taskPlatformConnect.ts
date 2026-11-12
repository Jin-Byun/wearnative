import path from 'node:path';
import {
    chalk,
    createTask,
    generatePlatformChoices,
    inquirerPrompt,
    logSuccess,
    logToSummary,
    type RnvPlatformKey,
    RnvTaskName,
    removeDirs,
    writeFileSync
} from '@rnv/core';

export default createTask({
    description: 'Connect platform template back to rnv',
    dependsOn: [RnvTaskName.projectConfigure],
    fn: async ({ ctx }) => {
        const configOriginal = ctx.files.project.config_original;
        if (!configOriginal) return;

        if (!ctx.files.project.config?.paths?.platformTemplatesDirs) {
            logToSummary('All supported platforms are connected. nothing to do.');
            return;
        }

        let selectedPlatforms: Array<RnvPlatformKey>;
        if (ctx.platform) {
            selectedPlatforms = [ctx.platform];
        } else {
            selectedPlatforms = (await inquirerPrompt({
                name: 'connectedPlatforms',
                message:
                    'This will point platformTemplates folders from your local project to ReNative managed one. Select platforms you would like to connect',
                type: 'checkbox',
                choices: generatePlatformChoices().map((choice) => ({
                    ...choice,
                    disabled: choice.isConnected
                }))
            })) as Array<RnvPlatformKey>;
        }

        if (selectedPlatforms.length) {
            for (const platform of selectedPlatforms) {
                if (!configOriginal.paths?.platformTemplatesDirs) break;
                if (Object.hasOwn(configOriginal.paths.platformTemplatesDirs, platform)) {
                    delete configOriginal.paths.platformTemplatesDirs[platform];
                }
                if (!Object.keys(configOriginal.paths.platformTemplatesDirs || {}).length) {
                    delete configOriginal.paths.platformTemplatesDirs; // also cleanup the empty object
                }
                writeFileSync(ctx.paths.project.config, configOriginal);
            }
        }
        const deletePlatformFolder = (await inquirerPrompt({
            name: 'deletePlatformFolder',
            type: 'confirm',
            message: 'Would you also like to delete the previously used platform folder?'
        })) as boolean;

        if (deletePlatformFolder) {
            const pathsToRemove: Array<string> = selectedPlatforms.map((platform) =>
                path.join(ctx.paths.project.platformTemplatesDirs[platform], platform)
            );

            // TODO: Remove shared folders as well
            await removeDirs(pathsToRemove);
        }

        logSuccess(
            `${chalk.bold.white(
                selectedPlatforms.join(',')
            )} now using ReNative platformTemplates located associated platform engines.`
        );
    },
    task: RnvTaskName.platformConnect
});
