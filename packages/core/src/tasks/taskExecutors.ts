import { executePipe } from '../buildHooks';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { getEngineRunnerByOwnerID } from '../engines';
import { RnvTaskName } from '../enums/taskName';
import { chalk, logDefault, logExitTask, logInfo, logInitTask, logRaw, logToSummary } from '../logger';
import { checkIfProjectAndNodeModulesExists } from '../projects/npm';
import { extractSingleExecutableTask, findTasksByTaskName } from './taskFinder';
import { generateStringFromTaskOption, shouldSkipTask } from './taskHelpers';
import type { RnvTask } from './types';

let executedTasks: Record<string, number> = {};
const TASK_LIMIT = 20;
const LimitReachedError = (
    task: string
) => `You reached maximum amount of executions per one task (${TASK_LIMIT}) task: ${task}.
This is to warn you ended up in task loop.
but issue might not be necessarily with this task

Please test your task code against parentTask and avoid repeatedly executing same task`;
type TaskOptions = {
    parentTaskName?: string;
    originTaskName?: string;
    isFirstTask?: boolean;
    isOptional?: boolean;
    taskInstance?: RnvTask;
};

export const executeTask = async ({
    taskName,
    skipInOnlyMode,
    alternativeTaskInOnlyMode,
    ...opts
}: {
    taskName: string;
    skipInOnlyMode?: boolean;
    alternativeTaskInOnlyMode?: string;
} & Omit<TaskOptions, 'taskInstance'>) => {
    if (skipInOnlyMode) {
        const ctx = getContext();
        if (ctx.program.opts().only) {
            const { match } = findTasksByTaskName(alternativeTaskInOnlyMode || RnvTaskName.configureSoft);
            const taskInstance = await extractSingleExecutableTask(match, taskName);
            return _executeTaskInstance({ taskInstance, ...opts });
        }
    }

    const { match, available } = findTasksByTaskName(taskName);

    if (match.length === 0 && !opts.isOptional) {
        logToSummary(`Current task registry:
${available.map((t) => `${t.task} ${chalk.gray(t.ownerID)}`).join('\n')}
`);
        throw new Error(`Task "${taskName}" not found in registry!`);
    }

    const taskInstance = await extractSingleExecutableTask(match, taskName);
    return _executeTaskInstance({ taskInstance, ...opts });
};

export const initializeTask = async (taskInstance: RnvTask | undefined) => {
    if (!taskInstance) {
        throw new Error('Task instance is undefined');
    }
    const { task } = taskInstance;
    logDefault('initializeTask', task);
    const c = getContext();
    _populateExtraParameters(c, taskInstance);

    // If engine has not been selected by picking interactive platform selection
    // let's pick it based on task ownerID
    if (!c.runtime.engine) {
        c.runtime.engine = getEngineRunnerByOwnerID(taskInstance);
        c.runtime.runtimeExtraProps = c.runtime.engine?.runtimeExtraProps || {};
    }
    logInfo(
        `Current engine: ${
            c.runtime.engine?.config
                ? `${chalk.bold.white(c.runtime.engine.id)} ${chalk.grey(`(${c.runtime.engine.rootPath})`)}`
                : 'n/a'
        }`
    );

    c.runtime.task = task;
    executedTasks = {};

    await _executeTaskInstance({ taskInstance, originTaskName: task, isFirstTask: true });
    return true;
};

const _executeTaskInstance = async ({
    taskInstance,
    parentTaskName,
    originTaskName,
    isFirstTask,
    isOptional
}: TaskOptions) => {
    const c = getContext();
    if (!taskInstance) {
        if (!isOptional) {
            throw new Error(`Task Instance is undefined`);
        }
        return;
    }

    const { help: needsHelp, only: inOnlyMode } = c.program.opts();
    c._currentTask = taskInstance.task;
    logInitTask(`${taskInstance.task}`);

    if ((executedTasks[taskInstance.task] ?? 0) > TASK_LIMIT) {
        throw new Error(LimitReachedError(taskInstance.task));
    }

    if (needsHelp && !parentTaskName && taskInstance) {
        logRaw(`\nDescription: ${taskInstance.description}\n`);
        c.program.outputHelp();
        return await taskInstance.fnHelp?.();
    }

    if (isFirstTask) {
        if (!taskInstance.isGlobalScope && c.files.project.package) {
            // This has to happen in order for hooks to be able to run
            await checkIfProjectAndNodeModulesExists();
        }
        c.runtime.forceBuildHookRebuild = !!taskInstance?.forceBuildHookRebuild;
    }

    const doPipe = !taskInstance.isGlobalScope && (isFirstTask || !inOnlyMode);
    if (doPipe) await _executePipe(taskInstance, 'before');
    executedTasks[taskInstance.task] = (executedTasks[taskInstance.task] ?? 0) + 1;
    c._currentTask = parentTaskName;
    if (taskInstance.dependsOn) {
        for (const dep of taskInstance.dependsOn) {
            await taskInstance.beforeDependsOn?.({
                taskName: dep,
                parentTaskName: taskInstance.task,
                originTaskName,
                ctx: c,
                shouldSkip: false
            });
            await executeTask({ taskName: dep, parentTaskName: taskInstance.task, originTaskName });
        }
    }
    const shouldSkip = shouldSkipTask({ taskName: taskInstance.task });
    if (taskInstance.fn && !shouldSkip) {
        await taskInstance.fn({
            taskName: taskInstance.task,
            parentTaskName,
            originTaskName,
            shouldSkip,
            ctx: c
        });
    }
    if (doPipe) await _executePipe(taskInstance, 'after');

    logExitTask(`${taskInstance.task}`);
};

const _populateExtraParameters = (c: RnvContext, { options }: RnvTask) => {
    if (c.program.option && options) {
        for (const opt of options) {
            c.program.option(generateStringFromTaskOption(opt), opt.description);
        }
    }
    c.program.showHelpAfterError();
    c.program.parse?.(process.argv);
};

const _executePipe = async (taskInstance: RnvTask, phase: string) =>
    executePipe(`${taskInstance.task.split(' ').join(':')}:${phase}`);
