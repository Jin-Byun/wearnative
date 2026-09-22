import fs from 'node:fs';
import path from 'node:path';
import {
    createRnvApi,
    createRnvContext,
    doResolve,
    executeRnvCore,
    exitRnvCore,
    generateStringFromTaskOption,
    getConfigProp,
    getContext,
    loadWorkspacesConfigSync,
    type RnvApiLogger,
    type RnvApiPrompt,
    type RnvApiSpinner,
    type RnvContextProgram,
    RnvTaskCoreOptionPresets,
    registerEngine
} from '@rnv/core';
import EngineCore from '@rnv/engine-core';
import { program } from 'commander';
import Spinner from 'ora';
import Logger from './logger';
import Prompt from './prompt';

export const run = ({ RNV_HOME_DIR }: { RNV_HOME_DIR?: string }) => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')).toString());
    let cmdValue = '';
    let cmdOption = '';

    program.version(packageJson.version, '-v, --version', 'output current version');

    for (const param of RnvTaskCoreOptionPresets.withCore()) {
        program.option(generateStringFromTaskOption(param), param.description);
    }

    program.allowUnknownOption(true); // integration options are not known ahead of time
    program.helpOption(false);

    // Make both arguments optional un order to allow `$ rnv` top level command
    program.arguments('[cmd] [option]').action((cmd, option) => {
        cmdValue = cmd;
        cmdOption = option;
    });

    program.parse(process.argv);

    process.on('SIGINT', () => {
        terminateProcesses();
        process.exit(0);
    });

    // If the first argument is a flag, then the subCommand is missing
    // this occurs when rnv has to execute unknown commands (ie intergration commands)
    // commander does not handle this scenario automatically
    if (cmdOption?.startsWith('-')) {
        cmdOption = '';
    }
    executeRnv({
        cmd: cmdValue,
        subCmd: cmdOption,
        program,
        process,
        spinner: Spinner,
        prompt: Prompt,
        logger: Logger,
        RNV_HOME_DIR
    })
        .then(() => {
            Logger.logSummary();
            exitRnvCore(0);
        })
        .catch((e: unknown) => {
            terminateProcesses();
            Logger.logError(e);
            Logger.logSummary();
            exitRnvCore(1);
        });
};

async function executeRnv({
    cmd,
    subCmd,
    process,
    program,
    spinner,
    prompt,
    logger,
    RNV_HOME_DIR
}: {
    cmd: string;
    subCmd: string;
    process: NodeJS.Process;
    program: RnvContextProgram;
    spinner: RnvApiSpinner;
    prompt: RnvApiPrompt;
    logger: RnvApiLogger;
    RNV_HOME_DIR?: string;
}) {
    // set mono and ci if json is enabled
    if (program.opts().json) {
        program.opts().mono = true;
        program.opts().ci = true;
    }

    createRnvApi({
        spinner,
        prompt,
        logger,
        getConfigProp,
        doResolve
    });
    createRnvContext({ program, process, cmd, subCmd, RNV_HOME_DIR });

    Logger.logInitialize();
    loadWorkspacesConfigSync();

    await registerEngine(EngineCore);

    await executeRnvCore();
}

function terminateProcesses(): void {
    const { runningProcesses } = getContext();
    try {
        for (const p of runningProcesses) {
            p.kill();
        }
    } catch (e) {
        Logger.logError(e);
    }
    runningProcesses.length = 0;
}
