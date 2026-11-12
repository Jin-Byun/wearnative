import { createTask, inquirerPrompt, logSuccess, logWarning, RnvTaskName, writeFileSync } from '@rnv/core';

export default createTask({
    description: 'Update specific plugin to latest supported version (rnv)',
    dependsOn: [RnvTaskName.projectConfigure],
    fn: async ({ ctx }) => {
        const confirm = (await inquirerPrompt({
            name: 'confirm',
            type: 'confirm',
            message: 'Above installed plugins will be updated with RNV'
        })) as boolean;

        if (!confirm) return;
        const { plugins } = ctx.buildConfig;
        if (plugins) {
            const cnf = ctx.files.project.config_original;
            if (!cnf) return;
            if (Object.keys(plugins).length) {
                cnf.plugins = cnf.plugins || {};
            }

            writeFileSync(ctx.paths.project.config, cnf);

            logSuccess('Plugins updated successfully!');
        } else {
            logWarning(`No plugins found in renative.json`);
        }
    },
    task: RnvTaskName.pluginUpdate
});
