import { inquirerPrompt } from '@rnv/core';
import { getContext } from '../../../getContext';
import { checkInputValue } from '../questionHelpers';
import type { NewProjectData } from '../types';

const Question = async ({ inputs }: NewProjectData): Promise<void> => {
    const c = getContext();
    const { projectName } = c.program.opts();
    if (checkInputValue(projectName)) {
        inputs.projectName = projectName;
        return;
    }
    inputs.projectName = (await inquirerPrompt({
        name: 'inputProjectName',
        type: 'input',
        default: 'hello-weaRNative',
        validate: (value) => checkInputValue(value),
        message: "What's your project Name? (folder will be created)"
    })) as string;
};

export default Question;
