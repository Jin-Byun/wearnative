import {
    chalk,
    createTask,
    getApi,
    inquirerPrompt,
    logSuccess,
    RnvTaskName,
    resolvePluginDependants,
    writeRenativeConfigFile
} from '@rnv/core';
import { checkAndInstallIfRequired } from '../../taskHelpers';
import { getPluginList } from './taskHelpers';

export default createTask({
    description: 'Add selected plugin to the project',
    dependsOn: [RnvTaskName.projectConfigure],
    fn: async ({ ctx }) => {
        const cnfOriginal = ctx.files.project.config_original;
        if (!cnfOriginal) return;

        const { asArray, allPlugins } = getPluginList();

        let selPluginKey = ctx.program.rawArgs?.[4];
        let selPlugin = selPluginKey && allPlugins[selPluginKey];
        if (!selPlugin) {
            selPluginKey = (await inquirerPrompt({
                name: 'plugin',
                type: 'rawlist',
                message: 'Select the plugins you want to add',
                choices: asArray,
                pageSize: 50
            })) as string;

            selPlugin = allPlugins[selPluginKey];
        }

        const cnfPlugins = cnfOriginal.plugins || {};
        if (!selPlugin.props) {
            cnfPlugins[selPluginKey as string] = 'source:rnv';
        } else {
            const finalProps: Record<string, string> = {};
            for (const propKey of Object.keys(selPlugin.props)) {
                const propValue = (await inquirerPrompt({
                    name: 'propValue',
                    type: 'input',
                    message: `${selPluginKey}: Add value for ${propKey} (You can do this later in ./renative.json file)`
                })) as string;
                finalProps[propKey] = propValue;
            }
            cnfPlugins[selPluginKey as string] = { props: finalProps };
        }
        cnfOriginal.plugins = cnfPlugins;

        const spinner = getApi()
            .spinner(`Installing: ${chalk.bold.white(selPluginKey)} v(${chalk.green(selPlugin.version)})`)
            .start('');

        writeRenativeConfigFile(ctx.paths.project.config, cnfOriginal);

        await resolvePluginDependants();
        await checkAndInstallIfRequired();

        spinner.succeed('All plugins installed!');
        logSuccess('Plugins installed successfully!');
        return true;
    },
    task: RnvTaskName.pluginAdd
});
