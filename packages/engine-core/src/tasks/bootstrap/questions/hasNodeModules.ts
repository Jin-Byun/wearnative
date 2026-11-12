import { fsExistsSync, getContext, inquirerPrompt, logWarning, removeDirs } from '@rnv/core';
import type { NewProjectData } from '../types';

const Question = async ({ inputs }: NewProjectData) => {
    const c = getContext();
    if (!fsExistsSync(c.paths.project.nodeModulesDir)) return;

    logWarning(
        `Found node_modules directory at your location. If you continue it will be deleted: ${c.paths.project.nodeModulesDir}`
    );
    inputs.confirmDeleteNodeModules = (await inquirerPrompt({
        name: 'confirm',
        type: 'confirm',
        message: 'Are you sure you want to continue?'
    })) as boolean;
    if (inputs.confirmDeleteNodeModules) {
        await removeDirs([c.paths.project.nodeModulesDir]);
    }
};

export default Question;
