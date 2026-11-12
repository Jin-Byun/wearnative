import {
    buildHooks,
    createTask,
    executeTask,
    fsExistsSync,
    inquirerPrompt,
    logDebug,
    RnvTaskName,
    RnvTaskOptions
} from '@rnv/core';

export default createTask({
    description: 'Run specific build hook',
    // dependsOn: [RnvTaskName.projectConfigure],
    fn: async ({ ctx, taskName, originTaskName }) => {
        if (fsExistsSync(ctx.paths.project.config)) {
            await executeTask({ taskName: RnvTaskName.projectConfigure, parentTaskName: taskName, originTaskName });
        } else {
            logDebug('Your are running your buildHook outside of renative project. SKIPPING project configure');
        }

        await buildHooks();

        if (!ctx.buildHooks) {
            throw new Error('Build hooks have not been compiled properly!');
        }
        const hooksList = Object.keys(ctx.buildHooks);
        if (hooksList.length === 0) {
            return true;
        }

        let hookName = ctx.program?.opts()?.exeMethod;
        if (!hookName || hookName === true || !ctx.buildHooks[hookName]) {
            hookName = (await inquirerPrompt({
                name: 'selectedHook',
                type: 'list',
                message: 'Pick an available hook:',
                choices: hooksList
            })) as string;
        }
        await ctx.buildHooks[hookName](ctx);

        return true;
    },
    task: RnvTaskName.hooksRun,
    options: [RnvTaskOptions.exeMethod],
    forceBuildHookRebuild: true,
    isGlobalScope: true
});
