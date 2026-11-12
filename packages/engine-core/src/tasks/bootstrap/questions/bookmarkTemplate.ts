import { chalk, getContext, inquirerPrompt, logInfo, writeFileSync } from '@rnv/core';
import type { NewProjectData } from '../types';

const Question = async ({ inputs }: NewProjectData) => {
    if (!inputs.template?.packageName) throw new Error('Template not selected');

    const c = getContext();
    const projTemplates = c.buildConfig.projectTemplates || {};
    const allKeys = Object.keys(projTemplates);
    if (
        inputs.template.type === 'existing' ||
        (allKeys.includes(inputs.template.packageName) && !inputs.template.localPath)
    ) {
        return;
    }

    const confirmAddTemplate = (await inquirerPrompt({
        name: 'confirmAddTemplate',
        type: 'confirm',
        message: `Would you like to add ${chalk.bold.white(inputs.template.packageName)} to your ${
            inputs.workspaceID
        } workspace template list?`
    })) as boolean;
    if (!confirmAddTemplate) return;

    const templateName = (await inquirerPrompt({
        name: 'templateName',
        type: 'input',
        default: `${inputs.template.packageName} (local)`,
        validate: (v) => !allKeys.includes(v) || 'Name already exists',
        message: 'Add short description'
    })) as string;

    const configFile = c.files.workspace.config || {};
    if (!configFile.projectTemplates) {
        configFile.projectTemplates = {};
    }
    configFile.projectTemplates[templateName] = {
        packageName: inputs.template.packageName,
        localPath: inputs.template.localPath,
        description: inputs.template.description
    };
    writeFileSync(c.paths.workspace.config, configFile);

    logInfo(`Updating ${c.paths.workspace.config}...DONE`);
};

export default Question;
