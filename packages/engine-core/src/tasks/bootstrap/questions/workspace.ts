import { getWorkspaceOptions, inquirerPrompt } from '@rnv/core';
import { getContext } from '../../../getContext';
import { checkInputValue } from '../questionHelpers';
import type { NewProjectData } from '../types';

const Question = async (data: NewProjectData) => {
    const c = getContext();
    const { ci, workspace } = c.program.opts();
    if (checkInputValue(workspace)) {
        data.inputs.workspaceID = workspace;
    } else if (ci) {
        data.inputs.workspaceID = data.defaults.workspaceID;
    } else {
        data.inputs.workspaceID = (await inquirerPrompt({
            name: 'inputWorkspace',
            type: 'list',
            message: 'What workspace to use?',
            default: data.defaults.workspaceID,
            choices: getWorkspaceOptions().keysAsArray
        })) as string;
    }

    c.runtime.selectedWorkspace = data.inputs.workspaceID;
    data.files.project.renativeConfig.workspaceID = data.inputs.workspaceID;
};

export default Question;
