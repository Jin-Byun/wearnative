import { applyTemplate, createTask, inquirerPrompt, logInfo, RnvTaskName } from '@rnv/core';

export default createTask({
    description: 'Reapply template (if configured) to current project',
    dependsOn: [RnvTaskName.projectConfigure],
    fn: async ({ ctx }) => {
        const { buildConfig } = ctx;
        if (buildConfig?.isTemplate) {
            throw new Error('Template projects cannot use template apply command');
        }
        logInfo(
            'This command will reapply template to current project. files will be overwritten. make sure you backed up your project before proceeding.'
        );
        const confirm = (await inquirerPrompt({
            type: 'confirm',
            name: 'confirm',
            message: 'Proceed?'
        })) as boolean;
        if (confirm) {
            return applyTemplate();
        }
    },
    task: RnvTaskName.templateApply
});
