import path from 'node:path';
import { commandExistsSync, executeAsync, fsExistsSync, inquirerPrompt, logInfo, logTask, logWarning } from '@rnv/core';
import { getContext } from '../../../getContext';
import type { NewProjectData } from '../types';

const Question = async ({ inputs }: NewProjectData) => {
    const c = getContext();
    const projectPath = c.paths.project.dir;
    if (fsExistsSync(path.join(projectPath, '.git'))) {
        inputs.confirmEnableGit = true;
        return;
    }
    const { gitEnabled, ci } = c.program.opts();
    inputs.confirmEnableGit = !!gitEnabled;

    if (gitEnabled === undefined && !ci) {
        inputs.confirmEnableGit = (await inquirerPrompt({
            name: 'gitEnabled',
            type: 'confirm',
            message: 'Do you want to set-up git in your new project?'
        })) as boolean;
    }

    if (inputs.confirmEnableGit) {
        await configureGit(projectPath);
    }
};

const configureGit = async (projectPath: string) => {
    logTask(`configureGit:${projectPath}`);
    if (!commandExistsSync('git')) {
        logWarning("We tried to create a git repo inside your project but you don't seem to have git installed");
        return;
    }
    logInfo('Your project does not have a git repo. Creating one...DONE');
    await executeAsync('git init', { cwd: projectPath });
};

export default Question;
