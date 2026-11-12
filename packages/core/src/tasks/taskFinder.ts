import { inquirerPrompt } from '../api';
import { getContext } from '../context/provider';
import { logDefault, logWarning } from '../logger';
import { getTaskNameFromCommand, selectPlatformIfRequired } from './taskHelpers';
import { getRegisteredTasks } from './taskRegistry';
import type { RnvTask } from './types';

export const findSuitableTask = async (): Promise<RnvTask | undefined> => {
    logDefault('findSuitableTask');
    const taskName = getTaskNameFromCommand();
    if (!taskName) {
        // Trigger auto selection outside of this function
        return undefined;
    }
    const { match } = findTasksByTaskName(taskName);

    return await extractSingleExecutableTask(match, taskName);
};

export const findTasksByTaskName = (taskName: string) => {
    const tasks = getRegisteredTasks();
    const taskArr = Object.values(tasks);

    const ctx = getContext();
    const plat = ctx.platform;
    const result: RnvTask[] = taskArr.flatMap((v) => {
        if (v.task !== taskName) {
            return [];
        }
        if (v.platforms && typeof plat === 'string') {
            if (!v.platforms.includes(plat)) {
                // If we found a task with platform restriction and it does not match current platform we skip it
                return [];
            }
            if (ctx.runtime.engine && v.ownerID !== ctx.runtime.engine.config?.name) {
                // If we already know specific engine to be used and task is not from that engine we skip it
                return [];
            }
        }
        return v;
    });
    return { match: result, available: taskArr };
};

export const extractSingleExecutableTask = async (
    suitableTasks: RnvTask[],
    taskName: string
): Promise<RnvTask | undefined> => {
    if (suitableTasks.length <= 1) return suitableTasks[0];

    // Restart the process now we defined specific platform
    await selectPlatformIfRequired();
    const newSuitableTasks = findTasksByTaskName(taskName);
    if (newSuitableTasks.match.length === 0) {
        logWarning('No suitable tasks found after platform selection');
        return;
    }
    if (newSuitableTasks.match.length === 1) return newSuitableTasks.match[0];

    // Found multiple Tasks with same name
    logWarning(`Multiple competing tasks found for ${taskName} task. Please select one:`);
    const result = (await inquirerPrompt({
        type: 'list',
        name: 'result',
        message: 'Select task',
        choices: newSuitableTasks.match.map((v) => ({
            name: `${v.task} - registered to: ${v.ownerID}`,
            value: v
        }))
    })) as RnvTask;
    return result;
};
