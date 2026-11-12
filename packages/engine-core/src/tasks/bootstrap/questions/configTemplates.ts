import path from 'node:path';
import {
    type ConfigFileTemplates,
    executeAsync,
    getContext,
    getPacManCommand,
    RnvFileName,
    readObjectSync
} from '@rnv/core';
import type { NewProjectData } from '../types';

const Question = async ({ files }: NewProjectData): Promise<void> => {
    const c = getContext();

    const cnfTemplatesName = '@rnv/config-templates';
    const cnfDepVer =
        files.template.renativeTemplateConfig?.templateConfig?.package_json?.devDependencies?.[cnfTemplatesName];
    if (!cnfDepVer) {
        if (!files.configTemplates.config) {
            // As fallback we'll use current rnv executor's config-templates
            files.configTemplates.config = c.files.rnvConfigTemplates.config;
        }
        return;
    }
    // If we find the config-templates package in the devDependencies of the project's package.json,
    // we will use it as source for engines
    await executeAsync(`${getPacManCommand(c)} ${cnfTemplatesName}@${cnfDepVer} --dev`, {
        cwd: c.paths.project.dir
    });
    const ctCnfPath = path.join(c.paths.project.nodeModulesDir, cnfTemplatesName, RnvFileName.renativeTemplates);
    // As fallback we'll use current rnv executor's config-templates
    files.configTemplates.config = readObjectSync<ConfigFileTemplates>(ctCnfPath) || c.files.rnvConfigTemplates.config;
};

export default Question;
