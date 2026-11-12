import { createTask, getWorkspaceConnectionString, inquirerPrompt, logRaw, RnvTaskName } from '@rnv/core';

export default createTask({
    description: 'Connect project with selected workspace',
    dependsOn: [RnvTaskName.projectConfigure],
    fn: async ({ ctx }) => {
        const cnf = ctx.files.dotRnv.configWorkspaces;
        if (!cnf) return;

        const choices = Object.entries(cnf.workspaces).map(
            ([key, wksp]) => `${key} ${getWorkspaceConnectionString(wksp)}`
        );

        const selectedWS = (await inquirerPrompt({
            type: 'list',
            name: 'selectedWS',
            message: 'Pick a workspace',
            choices
        })) as string;

        logRaw(selectedWS);
    },
    task: RnvTaskName.workspaceConnect,
    isGlobalScope: true
});
