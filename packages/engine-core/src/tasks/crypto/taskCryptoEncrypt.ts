import { statSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
    chalk,
    copyFileSync,
    createTask,
    fsExistsSync,
    fsMkdirSync,
    fsReaddir,
    fsReadFileSync,
    fsWriteFileSync,
    getRealPath,
    inquirerPrompt,
    logInfo,
    logSuccess,
    logWarning,
    RnvTaskName,
    removeFilesSync,
    writeFileSync
} from '@rnv/core';
import { createAdapter, EncryptionAlgorithm } from 'iocane';
import * as tar from 'tar';
import { getContext } from '../../getContext';
import { TaskOptions } from '../../taskOptions';
import { getEnvExportCmd, getEnvVar } from './common';

const readdirAsync = promisify(fsReaddir);

const generateRandomKey = (length: number) =>
    new Array<string>(length)
        .fill('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%^&*')
        .map((x) => x[Math.floor(Math.random() * x.length)])
        .join('');

const initializeCryptoDirectory = async (sourceFolder: string) => {
    const ctx = getContext();
    const targetFile = 'renative.private.json';
    fsMkdirSync(sourceFolder);

    if (ctx.paths.project.configPrivateExists) {
        const options = [
            'Move renative.private.json into encrypted folder (Recommended)',
            'Copy renative.private.json into encrypted folder',
            'Skip'
        ];
        const option = (await inquirerPrompt({
            name: 'option',
            type: 'list',
            choices: options,
            message: `Found existing private config in your project ${chalk.grey(
                ctx.paths.project.configPrivate
            )}. What to do next?`
        })) as string;
        if (option !== options[2]) {
            copyFileSync(ctx.paths.project.configPrivate, path.join(sourceFolder, targetFile));
        }
        if (option === options[0]) {
            removeFilesSync([ctx.paths.project.configPrivate]);
        }
    }
    if (!fsExistsSync(ctx.paths.project.appConfigsDir)) return;

    const configDir = path.join(sourceFolder, 'appConfigs');
    fsMkdirSync(configDir);
    const appConfigsDirs = await readdirAsync(ctx.paths.project.appConfigsDir);
    for (const item of appConfigsDirs) {
        if (item === targetFile) {
            copyFileSync(path.join(ctx.paths.project.appConfigsDir, item), path.join(configDir, targetFile));
        }
        const itemPath = path.join(ctx.paths.project.appConfigsDir, item);
        const stat = statSync(itemPath);
        if (!stat?.isDirectory()) continue;

        const appConfigDir = path.join(configDir, item);
        const existingFiles: string[] = await readdirAsync(itemPath);
        for (const file of existingFiles) {
            if (file !== targetFile) continue;
            fsMkdirSync(path.join(appConfigDir, 'certs'), { recursive: true });

            copyFileSync(
                path.join(ctx.paths.project.appConfigsDir, item, targetFile),
                path.join(appConfigDir, targetFile)
            );
        }
    }
};

const _checkAndConfigureCrypto = async () => {
    const ctx = getContext();
    const cnf = ctx.files.project.config_original;
    if (!cnf) return;
    // handle missing config
    const source = `./${ctx.files.project.config?.projectName}`;

    const envVar = getEnvVar();
    if (!envVar) return;

    if (ctx.files.project.config && !ctx.files.project.config.crypto) {
        const location = (await inquirerPrompt({
            type: 'input',
            name: 'location',
            message:
                'Where would you like your secrets to be residing? (path relative to renative project root, without leading or trailing slash. Ex. `myPrivateConfig/encrypt`)',
            default: 'secrets'
        })) as string;
        cnf.crypto = {
            path: `./${location}/privateConfigs.enc`
        };
        ctx.files.project.config.crypto = cnf.crypto;
        writeFileSync(ctx.paths.project.config, cnf);
    }

    // check if src folder actually exists
    const sourceFolder = path.join(ctx.paths.workspace.dir, source);

    if (!fsExistsSync(sourceFolder)) {
        logInfo(
            `It seems you are running encrypt for the first time. Directory ${chalk.bold.white(
                sourceFolder
            )} does not exist yet.
RNV will create it for you, make sure you add whatever you want encrypted in it and then run the command again`
        );
        await initializeCryptoDirectory(sourceFolder);
        await inquirerPrompt({
            type: 'confirm',
            message: 'Continue once ready.'
        });
    }

    let key = ctx.program.opts().key || ctx.process.env[envVar];
    let keyGenerated = false;
    if (!key) {
        const confirm = (await inquirerPrompt({
            type: 'confirm',
            message: `You haven't passed a key with --key or set an env variable named ${chalk.yellow(
                envVar
            )} for the encryption key. Would you like to generate one?`
        })) as boolean;
        if (confirm) {
            key = generateRandomKey(20);
            keyGenerated = true;
        } else {
            throw new Error(`encrypt: You must pass ${chalk.bold.white('--key')} or have env var defined:

${getEnvExportCmd(envVar, 'REPLACE_WITH_ENV_VARIABLE')}

Make sure you take into account special characters that might need to be escaped

`);
        }
        if (keyGenerated) {
            logSuccess(`The files were encrypted with key ${chalk.red(
                key
            )}. Make sure you keep it safe! Pass it with --key on decryption or set it as following env variable:

${getEnvExportCmd(envVar, key)}

Make sure you take into account special characters that might need to be escaped

`);
            ctx.process.env[envVar] = key;
        }
    }
};

export default createTask({
    description: 'Encrypts secure files from `~/<wokspace>/<project>/..` to project',
    dependsOn: [RnvTaskName.configureSoft],
    fn: async ({ ctx }) => {
        const projectName = ctx.files.project.config?.projectName;
        if (!projectName) {
            return Promise.reject(
                `projectName is missing. Make sure you're in a ReNative project or integration and have projectName defined.`
            );
        }

        const source = `./${projectName}`;

        await _checkAndConfigureCrypto();

        const destRaw = ctx.files.project.config?.crypto?.path;
        const tsWorkspacePath = path.join(ctx.paths.workspace.dir, projectName, 'timestamp');
        const envVar = getEnvVar();

        if (!envVar) return;

        const key = ctx.program.opts().key || ctx.process.env[envVar];

        if (destRaw) {
            const dest = `${getRealPath(destRaw, 'crypto.path')}`;
            const destTemp = `${path.join(ctx.paths.workspace.dir, projectName.replace('/', '-'))}.tgz`;
            const timestamp = Date.now();

            // check if dest folder actually exists
            const destFolder = dest.slice(0, dest.lastIndexOf('/'));
            fsMkdirSync(destFolder, { recursive: true });

            await tar.c(
                {
                    gzip: true,
                    file: destTemp,
                    cwd: ctx.paths.workspace.dir
                },
                [source]
            );

            const data = await createAdapter()
                .setAlgorithm(EncryptionAlgorithm.CBC)
                .encrypt(fsReadFileSync(destTemp), key);

            fsWriteFileSync(dest, data as string);
            removeFilesSync([destTemp]);
            fsWriteFileSync(`${dest}.timestamp`, `${timestamp}`);
            fsWriteFileSync(`${tsWorkspacePath}`, `${timestamp}`);
            logSuccess(`Files successfully encrypted into ${dest}`);
        } else {
            logWarning(`You don't have {{ crypto.path }} specificed in ${chalk.bold.white(ctx.paths.appConfigBase)}`);
        }
    },
    options: [TaskOptions.key],
    task: RnvTaskName.cryptoEncrypt
});
