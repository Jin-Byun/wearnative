import { inquirerPrompt } from '../api';
import { getContext } from '../context/provider';
import { getEngineRunnerByPlatform } from '../engines';
import { chalk } from '../logger';
import type { RnvPlatform } from '..//types';
import { initializeTask } from './taskExecutors';
import { getRegisteredTasks } from './taskRegistry';
import type { RnvTask } from './types';

const lowercaseInclude = (value: string, input: string) => value.toLowerCase().includes(input.toLowerCase());
const autoCompleteBase = {
    type: 'autocomplete',
    name: 'selected',
    loop: false,
    pageSize: 15
};
const isTaskSupportedOnPlatform = (task: RnvTask, platform: RnvPlatform) => {
    if (!task.platforms) return true;

    const selectedEngineID = getEngineRunnerByPlatform(platform)?.config.name;
    // If we already specified platform we can skip tasks registered to unsupported engines
    if (task.ownerType === 'engine' && selectedEngineID && task.ownerID && task.ownerID !== selectedEngineID) {
        return false;
    }
    return !platform || task.platforms.includes(platform);
};

const groupingWizard = async (tasks: RnvTask[]) => {
    const ctx = getContext();
    const filteredTasks = tasks.filter((task) => isTaskSupportedOnPlatform(task, ctx.platform));
    const optionsMap: Record<string, { name: string; value: RnvTask[] }> = {};
    for (const taskInstance of filteredTasks) {
        const prefix = taskInstance.task.slice(0, taskInstance.task.indexOf(' '));
        if (optionsMap[prefix]) {
            optionsMap[prefix].value.push(taskInstance);
            continue;
        }
        if (filteredTasks.filter(({ task }) => task.slice(0, task.indexOf(' ')) === prefix).length > 1) {
            optionsMap[prefix] = {
                name: `${prefix}${chalk.gray('...')}`,
                value: [taskInstance]
            };
        } else {
            optionsMap[taskInstance.task] = {
                name: `${taskInstance.task} ${chalk.gray(taskInstance.description)}`,
                value: [taskInstance]
            };
        }
    }
    const options = Object.values(optionsMap).sort((a, b) =>
        a.value[0].isPriorityOrder ? -1 : b.value.length - a.value.length
    );
    const initialValue = ctx.program.args?.join(' ');
    const initialValueMatch = initialValue && optionsMap[initialValue]?.value;
    if (initialValueMatch) {
        return await disambiguatingWizard(initialValueMatch);
    }
    const selected: RnvTask[] = await inquirerPrompt({
        ...autoCompleteBase,
        source: async (term) => options.filter((o) => !term || lowercaseInclude(o.name, term)),
        initialValue,
        message: `Pick a command`
    });
    return await disambiguatingWizard(selected);
};

const disambiguatingWizard = async (tasks: RnvTask[]) => {
    if (tasks.length === 1) return tasks[0];

    const ctx = getContext();
    if (!ctx.platform) {
        const uniquePlatforms = Array.from(new Set(tasks.flatMap((t) => t.platforms ?? []))).filter((p) =>
            ctx.buildConfig.defaults?.supportedPlatforms?.includes(p)
        );
        const isPlatformDisambiguating = tasks.some((task) =>
            uniquePlatforms.some((platform) => !isTaskSupportedOnPlatform(task, platform))
        );
        if (isPlatformDisambiguating) {
            ctx.platform = (await inquirerPrompt({
                ...autoCompleteBase,
                source: async (input) =>
                    uniquePlatforms
                        .filter((p) => !input || lowercaseInclude(p, input))
                        .map((value) => ({ value, name: value })),
                message: `Pick a platform`
            })) as RnvPlatform;
        }
    }

    const filteredTasks = tasks.filter((task) => isTaskSupportedOnPlatform(task, ctx.platform));
    if (filteredTasks.length === 1) {
        return filteredTasks[0];
    }
    const options = filteredTasks
        .map((taskInstance) => {
            const isAmbiguous = filteredTasks.filter((t) => t.task === taskInstance.task).length > 1;
            return {
                name: `${taskInstance.task} ${
                    isAmbiguous ? chalk.gray(`(${taskInstance.ownerID}) `) : ''
                }${chalk.gray(taskInstance.description)}`,
                value: taskInstance
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    return (await inquirerPrompt({
        ...autoCompleteBase,
        source: async (input) => options.filter((o) => !input || lowercaseInclude(o.name, input)),
        message: `Pick a command`,
        choices: options
    })) as RnvTask;
};

export const runInteractiveWizard = async () => {
    const ctx = getContext();
    const selected = await groupingWizard(Object.values(getRegisteredTasks()));
    const taskArr = selected.task.split(' ');
    ctx.command = taskArr[0];
    ctx.subCommand = taskArr[1] || null;
    return initializeTask(selected);
};
