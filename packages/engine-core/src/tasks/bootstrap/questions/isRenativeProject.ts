import { fsExistsSync, getContext, inquirerPrompt, logWarning } from '@rnv/core';
import type { NewProjectData } from '../types';

const Question = async (data: NewProjectData) => {
    const c = getContext();
    if (!fsExistsSync(c.paths.project.config)) return;

    logWarning(`You are in ReNative project. Found: ${c.paths.project.config}`);
    data.inputs.confirmInRnvProject = (await inquirerPrompt({
        name: 'confirm',
        type: 'confirm',
        message: 'Are you sure you want to continue?'
    })) as boolean;
    if (!data.inputs.confirmInRnvProject) {
        throw new Error('Cancelled');
    }
};

export default Question;
