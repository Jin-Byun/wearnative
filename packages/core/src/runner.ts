import { getContext } from '@context/provider';
import { configureRuntimeDefaults } from '@context/runtime';
import { checkAndUpdateProjectIfRequired } from '@projects/update';
import { initializeTask } from '@tasks/taskExecutors';
import { findSuitableTask } from '@tasks/taskFinder';
import { getTaskNameFromCommand, selectPlatformIfRequired } from '@tasks/taskHelpers';
import type { RnvTask } from '@tasks/types';
import { runInteractiveWizard } from '@tasks/wizard';
import { loadDefaultConfigTemplates } from './configs';
import { installEngines, registerMissingPlatformEngines } from './engines';
import { logInfo } from './logger';
import { checkAndMigrateProject } from './migrator';
import { loadRnvModulesFromProject } from './modules';
import { updateRenativeConfigs } from './plugins';

export const exitRnvCore = async (code: number) => {
    const ctx = getContext();
    ctx.process?.exit(code);
};

const _installAndRegisterAllEngines = async () => {
    const result = await installEngines();
    // If false make sure we reload configs as it means it's freshly installed
    if (!result) {
        await updateRenativeConfigs();
    }
    await registerMissingPlatformEngines();
};

export const executeRnvCore = async () => {
    const c = getContext();
    loadDefaultConfigTemplates();
    configureRuntimeDefaults();
    checkAndMigrateProject();
    await updateRenativeConfigs();
    await checkAndUpdateProjectIfRequired();

    // TODO: rename to something more meaningful or DEPRECATE entirely
    if (c.program.opts().npxMode) {
        return;
    }

    // for "rnv" we simply load all engines upfront
    const { configExists } = c.paths.project;
    if (!c.command && configExists) {
        await _installAndRegisterAllEngines();
        loadRnvModulesFromProject();
        return await runInteractiveWizard();
    }

    let initTask: RnvTask | undefined;

    // Special Case for engine-core tasks
    // they don't require other engines to be loaded if isGlobalScope = true
    // ie rnv link
    initTask = await findSuitableTask();
    if (initTask) {
        return await initializeTask(initTask);
    }

    // Next we load all integrations and see if there is a task that matches
    loadRnvModulesFromProject();
    initTask = await findSuitableTask();
    if (initTask) {
        if (initTask.platforms) {
            // If integration task requires platform selection
            // we do it here so correct engine is registered properly
            await selectPlatformIfRequired(initTask, true);
        }

        return await initializeTask(initTask);
    }

    // Still no task found. time to load all engines to see if anything matches
    await _installAndRegisterAllEngines();
    initTask = await findSuitableTask();
    if (initTask) {
        return await initializeTask(initTask);
    }

    // Still no task found. time to check sub tasks options via wizard
    logInfo(`Did not find exact match for ${getTaskNameFromCommand()}. Running interactive wizard for sub-tasks`);
    return await runInteractiveWizard();
};
