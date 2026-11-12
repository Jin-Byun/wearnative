import { executeAsync, getContext, getPacManCommand, inquirerPrompt } from '@rnv/core';
import type { NewProjectData } from '../types';

const Question = async ({ inputs }: NewProjectData) => {
    const c = getContext();

    inputs.confirmProjectInstall = (await inquirerPrompt({
        name: 'confirmInstallProject',
        type: 'confirm',
        message: 'Project is ready. Do you want to install all dependencies now?'
    })) as boolean;

    if (inputs.confirmProjectInstall) {
        await executeAsync(`${getPacManCommand(c, 'init')}`, {
            cwd: c.paths.project.dir
        });
    }
};

export default Question;
