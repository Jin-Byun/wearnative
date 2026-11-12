import {
    chalk,
    configureRuntimeDefaults,
    createTask,
    fsExistsSync,
    logToSummary,
    RnvTaskName,
    readObjectSync,
    validateRenativeProjectSchema
} from '@rnv/core';
import lGet from 'lodash/get';

const configTargets = [
    'workspace.config',
    'workspace.project.config',
    'workspace.appConfig.configs',
    'project.config',
    'appConfig.configs'
];

export default createTask({
    description: 'Checks validity and config health of your project',
    dependsOn: [RnvTaskName.appConfigure],
    beforeDependsOn: async () => {
        configureRuntimeDefaults();
    },
    fn: async ({ ctx }) => {
        configureRuntimeDefaults();

        let errMsg = 'RENATIVE JSON SCHEMA VALIDITY CHECK:\n\n';
        const initialErrMsgLength = errMsg.length;
        const configPaths: Array<string> = configTargets.flatMap((target) => lGet(ctx.paths, target));

        for (const cPath of configPaths) {
            if (!fsExistsSync(cPath)) continue;
            const cObj = readObjectSync(cPath);
            const result = validateRenativeProjectSchema(cObj);
            if (result.success) continue;

            errMsg += chalk.yellow(`\nInvalid schema in ${cPath}. ISSUES:\n\n`);
            result.error.issues?.forEach((err) => {
                errMsg += chalk.yellow(`${chalk.grey(err.path)}: ${err.message}`);
            });
        }

        if (errMsg.length > initialErrMsgLength) {
            errMsg += chalk.green(`PASSED ${configPaths.length} files`);
        }

        logToSummary(errMsg);
    },
    task: RnvTaskName.doctor,
    isGlobalScope: true
});
