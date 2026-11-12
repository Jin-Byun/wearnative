import {
    chalk,
    createTask,
    generateStringFromTaskOption,
    getRegisteredEngines,
    logToSummary,
    RnvTaskName,
    RnvTaskOptions
} from '@rnv/core';

export default createTask({
    description: 'Display generic help',
    fn: async () => {
        // PARAMS
        const optsString = Object.values(RnvTaskOptions)
            .map((opt) => chalk.grey(`${generateStringFromTaskOption(opt)}, ${opt.description}`))
            .join('\n');

        // TASKS
        const engines = getRegisteredEngines();
        const cmdsString = engines.flatMap((engine) => Object.values(engine.tasks).map(({ task }) => task)).join(', ');

        logToSummary(`
${chalk.bold.white('COMMANDS:')}

${cmdsString}

${chalk.bold.white('OPTIONS:')}

${optsString}

`);
    },
    task: RnvTaskName.help,
    isGlobalScope: true,
    isPriorityOrder: true
});
