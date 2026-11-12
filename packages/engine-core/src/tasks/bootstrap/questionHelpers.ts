import path from 'node:path';
import {
    chalk,
    getContext,
    inquirerPrompt,
    isYarnInstalled,
    populateContextPaths,
    populateContextPkgFiles,
    RnvFileName,
    type RnvPlatformKey,
    updateRenativeConfigs,
    writeFileSync
} from '@rnv/core';
import type { NewProjectData } from './types';

export const processChdirToProject = async () => {
    const c = getContext();
    // In order to execute rnv from new origin (sub folder we need to reset paths to new cwd())
    process.chdir(c.paths.project.dir);
    populateContextPaths(c, c.paths.rnv.dir);
    populateContextPkgFiles(c);
    return true;
};

export const checkInputValue = (value: string | boolean): value is string => {
    return !!value && typeof value === 'string';
};

export const validateAndAssign = async (
    {
        value,
        validFn,
        name,
        defaultVal,
        message,
        warning
    }: {
        value: string;
        validFn: (value: string) => true | string;
        name: string;
        defaultVal: (() => string) | string | undefined;
        message: string;
        warning: string;
    },
    ci: boolean
): Promise<string> => {
    const isValid = validFn(value);
    if (value && isValid === true) {
        return value;
    } else {
        const warningMessage = typeof isValid === 'string';
        const answer = (await inquirerPrompt({
            name,
            type: 'input',
            default: defaultVal,
            validate: validFn,
            message,
            warningMessage: ci && warningMessage ? warning : undefined
        })) as string;
        return answer;
    }
};

export const saveProgressIntoProjectConfig = async ({ files }: NewProjectData) => {
    const c = getContext();
    writeFileSync(c.paths.project.config, files.project.renativeConfig);
    writeFileSync(c.paths.project.package, files.project.packageJson);
};

export const initNewProject = async () => {
    const c = getContext();

    c.paths.project.package = path.join(c.paths.project.dir, RnvFileName.package);
    c.paths.project.config = path.join(c.paths.project.dir, RnvFileName.renative);

    // todo: change rnv to weaRNative
    const data: NewProjectData = {
        defaults: {
            appVersion: '0.1.0',
            templateName: '@rnv/template-starter',
            projectName: 'My wearNative Project',
            appTitle: 'My wearNative App',
            workspaceID: 'rnv'
        },
        inputs: {},
        files: {
            project: {
                renativeConfig: {},
                packageJson: {}
            },
            configTemplates: {},
            template: {
                renativeTemplateConfig: {},
                renativeConfig: {}
            }
        }
    };
    // TODO: This enforces to generate initial runtime configs. find more reliable way to do this
    await updateRenativeConfigs();
    return data;
};

export const configureConfigOverrides = async ({ inputs, files }: NewProjectData) => {
    const { renativeConfig } = files.project;
    const supPlats = inputs.supportedPlatforms || [];

    // In case of copied config instead of extended we want to cleanup unused platforms
    if (renativeConfig.platforms) {
        for (const key of Object.keys(renativeConfig.platforms) as RnvPlatformKey[]) {
            if (!supPlats.includes(key) && renativeConfig.platforms) {
                delete renativeConfig.platforms[key];
            }
        }
    }

    // This is project config override only
    renativeConfig.defaults = renativeConfig.defaults || {};
    renativeConfig.defaults.supportedPlatforms = supPlats;
};

export const generateProjectOverview = (data: NewProjectData) => {
    const { inputs } = data;

    const tempString = inputs.template?.localPath || `${inputs.template?.packageName}@${inputs.template?.version}`;

    const highlight = chalk.bold;

    const installAddon = !inputs.confirmProjectInstall ? `\n  ${isYarnInstalled() ? 'yarn' : 'npm install'}` : '';

    const str = `  Generated Project Summary:
  -------------------------
  Project Name (--projectName): ${highlight(inputs.projectName)}
  Package name: ${highlight(inputs.packageName)}
  Project Version (--appVersion): ${highlight(inputs.appVersion)}
  Workspace (--workspace): ${highlight(inputs.workspaceID)}
  App Title (--title): ${highlight(inputs.appTitle)}
  App ID (--id): ${highlight(inputs.appID)}
  Project Template (--template): ${highlight(tempString)}
  Git Enabled (--gitEnabled): ${highlight(inputs.confirmEnableGit)}
  Enabled Platforms: ${highlight((inputs.supportedPlatforms || []).join(', '))}
  -------------------------
  ${chalk.green('✔ Your project is ready!')} Run it with:
${chalk.bold.white(`
  cd ${inputs.projectFolderName}${installAddon}
  npx rnv run`)}`;

    return str;
};
