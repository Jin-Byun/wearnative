import path from 'node:path';
import { createTask, createWorkspace, fsExistsSync, inquirerPrompt, RnvTaskName } from '@rnv/core';

export default createTask({
    description: 'Add new workspace',
    dependsOn: [RnvTaskName.projectConfigure],
    fn: async () => {
        const workspace = (await inquirerPrompt({
            name: 'workspace',
            type: 'input',
            message: 'absolute path to new workspace',
            validate: (i: string) => !!i || 'No path provided'
        })) as string;

        const workspacePath = path.join(workspace);

        if (fsExistsSync(workspacePath)) {
            const confirm = (await inquirerPrompt({
                name: 'confirm',
                type: 'confirm',
                message: `Folder ${workspacePath} already exists are you sure you want to override it?`
            })) as boolean;
            if (!confirm) return false;
        }

        const defaultWorkspaceID = path.basename(workspacePath).replace(/@|\./g, '') || 'rnv';

        const workspaceIDInput = (await inquirerPrompt({
            name: 'workspaceIDInput',
            type: 'input',
            message: `ID of the workspace (${defaultWorkspaceID})`,
            default: defaultWorkspaceID
        })) as string;

        createWorkspace(workspaceIDInput, workspacePath);

        return true;
    },
    task: RnvTaskName.workspaceAdd,
    isGlobalScope: true
});
