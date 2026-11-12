import { getContext, inquirerPrompt, mergeObjects, type NpmPackageFile } from '@rnv/core';
import type { NewProjectData } from '../types';

const Question = async ({ inputs, files }: NewProjectData): Promise<void> => {
    const tplName = inputs.template?.packageName;
    if (!tplName) throw new Error('Template not selected');

    const optExtend = 'Extend template (cleaner, overridable)';
    const optCopy = 'Copy from template (full control)';
    const configOption = (await inquirerPrompt({
        name: 'configOption',
        type: 'list',
        message: 'Would you like to extend or copy renative.json from config template?',
        default: optExtend,
        choices: [optExtend, optCopy]
    })) as string;
    const templateConfig =
        configOption === optExtend
            ? files.template.renativeTemplateConfig.templateConfig?.renative_json || {
                  extendsTemplate: `${tplName}/renative.json`
              }
            : files.template.renativeConfig;
    Object.assign(files.project.renativeConfig, templateConfig);

    const packageJson = files.template.renativeTemplateConfig.templateConfig?.package_json as NpmPackageFile;
    const c = getContext();
    files.project.packageJson = mergeObjects(c, files.project.packageJson, packageJson);
};

export default Question;
