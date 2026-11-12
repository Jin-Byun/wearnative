import type { RnvTask, RnvTaskMap } from './types';

const REGISTERED_TASKS: RnvTaskMap = {};

export const registerRnvTasks = <OKey extends string>(tasks: RnvTaskMap<OKey>) => {
    Object.values(tasks).forEach(registerRnvTask);
};

const registerRnvTask = <OKey extends string>(taskInstance: RnvTask<OKey>) => {
    if (!taskInstance.key) {
        throw new Error('Task key is required');
    }
    if (taskInstance.key in REGISTERED_TASKS) {
        throw new Error(`Task key must be unique. Task with key ${taskInstance.key} already exists`);
    }

    REGISTERED_TASKS[taskInstance.key] = taskInstance as RnvTask;
};

export const getRegisteredTasks = () => REGISTERED_TASKS;
