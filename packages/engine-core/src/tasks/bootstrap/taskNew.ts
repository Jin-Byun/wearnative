import {
    applyTemplate,
    configureTemplateFiles,
    createTask,
    generateLocalJsonSchemas,
    logToSummary,
    RnvTaskName,
    updateRenativeConfigs
} from '@rnv/core';
import { TaskOptions } from '../../taskOptions';
import {
    configureConfigOverrides,
    generateProjectOverview,
    initNewProject,
    processChdirToProject,
    saveProgressIntoProjectConfig
} from './questionHelpers';
import inquiryAppConfigs from './questions/appConfigs';
import inquiryAppID from './questions/appID';
import inquiryApplyTemplate from './questions/applyTemplate';
import inquiryAppTitle from './questions/appTitle';
import inquiryAppVersion from './questions/appVersion';
import inquiryBookmarkTemplate from './questions/bookmarkTemplate';
import inquiryBootstrapQuestions from './questions/bootstrapQuestions';
import inquiryConfigTemplates from './questions/configTemplates';
import inquiryGit from './questions/confirmGit';
import inquiryHasNodeModules from './questions/hasNodeModules';
import inquiryInstallEngines from './questions/installEngines';
import inquiryProjectInstall from './questions/installProject';
import inquiryInstallTemplate from './questions/installTemplate';
import inquiryIsRenativeProject from './questions/isRenativeProject';
import inquiryProjectFolder from './questions/projectFolder';
import inquiryProjectName from './questions/projectName';
import inquiryHandlePeerDepsNpm from './questions/resolvePeerDepsNPM';
import inquirySupportedPlatforms from './questions/supportedPlatforms';
import inquiryWorkspace from './questions/workspace';

export default createTask({
    description: 'Create new ReNative project',
    fn: async () => {
        // Initialize Project
        const payload = await initNewProject();
        // Initial questions
        await inquiryProjectName(payload);
        await inquiryProjectFolder(payload);
        await inquiryIsRenativeProject(payload);
        await inquiryHasNodeModules(payload);
        await inquiryWorkspace(payload);
        await saveProgressIntoProjectConfig(payload);
        // Switch execution context to new directory
        await processChdirToProject();
        // Install template only (this avoids whole npm project install)
        await inquiryInstallTemplate(payload);
        await inquiryConfigTemplates(payload);
        await inquiryApplyTemplate(payload);
        await saveProgressIntoProjectConfig(payload);
        // Gather project/app info
        await inquiryBookmarkTemplate(payload);
        await inquiryAppTitle(payload);
        await inquiryAppID(payload);
        await inquiryAppVersion(payload);
        await saveProgressIntoProjectConfig(payload);

        await inquirySupportedPlatforms(payload);
        await inquiryBootstrapQuestions(payload);
        await inquiryGit(payload);
        // Configure final config overrides
        await updateRenativeConfigs();
        await configureConfigOverrides(payload);
        await saveProgressIntoProjectConfig(payload);
        // Now we can apply template (required for appConfigs to be generated properly)
        await updateRenativeConfigs();
        await applyTemplate();
        await configureTemplateFiles();
        await generateLocalJsonSchemas();
        await inquiryAppConfigs(payload);
        await inquiryHandlePeerDepsNpm();
        await inquiryInstallEngines(payload);

        await inquiryProjectInstall(payload);

        logToSummary(generateProjectOverview(payload));

        return true;
    },
    task: RnvTaskName.new,
    options: [
        TaskOptions.gitEnabled,
        TaskOptions.answer,
        TaskOptions.workspace,
        TaskOptions.template,
        TaskOptions.projectName,
        TaskOptions.projectTemplate,
        TaskOptions.templateVersion,
        TaskOptions.localTemplatePath,
        TaskOptions.title,
        TaskOptions.appVersion,
        TaskOptions.id
    ],
    isGlobalScope: true,
    isPriorityOrder: true
});
