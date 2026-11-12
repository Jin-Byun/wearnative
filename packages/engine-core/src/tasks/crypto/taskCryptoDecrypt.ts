import path from 'node:path';
import {
    chalk,
    cleanFolder,
    copyFileSync,
    createTask,
    fsExistsSync,
    fsReadFileSync,
    fsWriteFileSync,
    getRealPath,
    inquirerPrompt,
    logSuccess,
    logWarning,
    type RnvContext,
    RnvTaskName,
    removeFilesSync
} from '@rnv/core';
import { createAdapter, EncryptionAlgorithm } from 'iocane';
import * as tar from 'tar';
import { TaskOptions } from '../../taskOptions';
import { getEnvExportCmd, getEnvVar } from './common';

const _unzipAndCopy = async (
    ctx: RnvContext,
    shouldCleanFolder: boolean,
    destTemp: string,
    wsPath: string,
    ts: string,
    destFolder: string
) => {
    if (shouldCleanFolder) {
        await cleanFolder(wsPath);
    }

    await tar.x({
        file: destTemp,
        cwd: ctx.paths.workspace.dir
    });

    removeFilesSync([destTemp]);
    if (ctx.files.project.package.name && fsExistsSync(ts)) {
        copyFileSync(ts, path.join(ctx.paths.workspace.dir, ctx.files.project.package.name, 'timestamp'));
    }
    logSuccess(`Files successfully extracted into ${destFolder}`);
};

const NO_KEY_ERR_MSG = (envVar: string) => `encrypt: You must pass ${chalk.bold.white('--key')} or have env var defined:

${getEnvExportCmd(envVar, 'REPLACE_WITH_ENV_VARIABLE')}

Make sure you take into account special characters that might need to be escaped.
`;

export default createTask({
    description: 'Decrypt encrypted project files into local `~/<wokspace>/<project>/..`',
    dependsOn: [RnvTaskName.configureSoft],
    fn: async ({ ctx }) => {
        const crypto = ctx.files.project.config?.crypto;
        const sourceRaw = crypto?.path;

        if (crypto?.isOptional && !sourceRaw) {
            logWarning(`You don't have {{ crypto.path }} specificed in ${chalk.bold.white(ctx.paths.appConfigBase)}`);
            return;
        }

        const projectName = ctx.files.project.config?.projectName;
        const envVar = getEnvVar();
        if (!projectName || !envVar) return;

        const { ci, reset, key: optKey } = ctx.program.opts();

        const isCryptoReset = ctx.command === 'crypto' && reset === true;
        const destFolder = path.join(ctx.paths.workspace.dir, projectName);

        let shouldCleanFolder = true;
        if (ci !== true && !isCryptoReset && fsExistsSync(destFolder)) {
            const options = ['Yes - override (recommended)', 'Yes - merge', 'Skip'];
            const option = (await inquirerPrompt({
                name: 'option',
                type: 'list',
                choices: options,
                message: `How to decrypt to ${chalk.bold.white(destFolder)} ?`
            })) as string;
            if (option === options[2]) return true;
            shouldCleanFolder = option === options[0];
        }

        const source = `${getRealPath(sourceRaw, 'crypto.path')}`;
        const ts = `${source}.timestamp`;
        const wsPath = destFolder;
        const destTemp = `${path.join(ctx.paths.workspace.dir, projectName.replace('/', '-'))}.tgz`;
        if (fsExistsSync(destTemp)) {
            const confirm = (await inquirerPrompt({
                type: 'confirm',
                message: `Found existing decrypted file at ${chalk.bold.white(
                    destTemp
                )}. want to use it and skip decrypt ?`
            })) as boolean;
            if (confirm) {
                await _unzipAndCopy(ctx, shouldCleanFolder, destTemp, wsPath, ts, destFolder);
                return true;
            }
        }

        const key = optKey || ctx.process.env[envVar];
        if (!key) {
            throw new Error(NO_KEY_ERR_MSG(envVar));
        }

        if (!fsExistsSync(source)) {
            throw new Error(`Can't decrypt. ${chalk.bold.white(source)} is missing!`);
        }

        let data: string;
        try {
            data = (await createAdapter()
                .setAlgorithm(EncryptionAlgorithm.CBC)
                .decrypt(fsReadFileSync(source), key)) as string;
        } catch (e) {
            if (e instanceof Error) {
                throw e as Error;
            }
            throw new Error(e as string);
        }

        fsWriteFileSync(destTemp, data);

        await _unzipAndCopy(ctx, shouldCleanFolder, destTemp, wsPath, ts, destFolder);
    },
    options: [TaskOptions.key],
    task: RnvTaskName.cryptoDecrypt
});
