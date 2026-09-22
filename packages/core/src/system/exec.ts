/* eslint-disable no-control-regex */

import type { WithImplicitCoercion } from 'node:buffer';
import { exec, execSync } from 'node:child_process';
import { access, accessSync, constants } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { type Options as ExecaOptions, execa, type Subprocess } from 'execa';
import { getApi } from '../api/provider';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { chalk, logDebug, logError, logRaw } from '../logger';
import { fsExistsSync } from './fs';
import type { ExecCallback, ExecOptions } from './types';

// const { exec, execSync } = require('child_process');

const FIRE_AND_FORGET: ExecOptions = {
    stdio: 'ignore', // Disable child_process output
    detached: true, // Killing rnv command will NOT kill process
    silent: true, // Disable spinner
    shell: true // runs `command` inside of a shell. Uses `/bin/sh` on UNIX and `cmd.exe` on Windows
};

const NO_SPINNER_FULL_ERROR_SUMMARY: ExecOptions = {
    stdio: 'pipe', // pipe will print final error into SUMMARY box but nothing during execution
    detached: true, // Killing rnv command will NOT kill process
    silent: true, // Disable spinner
    shell: true // runs `command` inside of a shell. Uses `/bin/sh` on UNIX and `cmd.exe` on Windows
};

const INHERIT_OUTPUT_NO_SPINNER: ExecOptions = {
    detached: false, // Killing command will kill process
    silent: true, // silent: true => will not show execa spinner
    stdio: 'inherit', // inherit will print during execution but no details in SUMMARY box
    shell: true // runs `command` inside of a shell. Uses `/bin/sh` on UNIX and `cmd.exe` on Windows
    // mono: true,
};

const SPINNER_FULL_ERROR_SUMMARY: ExecOptions = {
    detached: false, // Killing command will kill process
    silent: false,
    stdio: 'pipe', // pipe will print final error into SUMMARY box but nothing during execution
    shell: true, // runs `command` inside of a shell. Uses `/bin/sh` on UNIX and `cmd.exe` on Windows
    mono: false
};

export const ExecOptionsPresets = {
    // Do not await when using FIRE_AND_FORGET option
    FIRE_AND_FORGET,
    INHERIT_OUTPUT_NO_SPINNER,
    SPINNER_FULL_ERROR_SUMMARY,
    NO_SPINNER_FULL_ERROR_SUMMARY
} as const;

const replaceOverridesInString = (string: string | undefined, overrides: Array<string>, mask: string) => {
    if (!string) return '';
    let replacedString = string;
    if (overrides?.length && replacedString?.replace) {
        overrides.forEach((v) => {
            const regEx = new RegExp(v, 'g');
            replacedString = replacedString.replace(regEx, mask);
        });
    }
    return replacedString;
};

const _execute = async (c: RnvContext, command: string | Array<string>, opts: ExecOptions = {}) => {
    const defaultOpts: ExecOptions = {
        stdio: 'pipe',
        localDir: path.resolve('./node_modules/.bin'),
        preferLocal: true,
        all: true,
        maxErrorLength: c.program?.opts().maxErrorLength,
        mono: c.program?.opts().mono || c.program?.opts().json
    };

    const blue2 = chalk.rgb(50, 50, 255).bold;

    const mergedOpts = { ...defaultOpts, ...opts };

    const printableEnv =
        opts.env && (c.program.opts().info || c.program.opts().printExec)
            ? Object.keys(opts.env)
                  .map((k) => `${k}=${opts?.env?.[k]}`)
                  .join(' ')
            : null;

    const commandAsString = Array.isArray(command) ? command.join(' ') : command;
    let cleanCommand = commandAsString;

    let interval: NodeJS.Timeout;
    const intervalTimer = 30000; // 30s
    let timer = intervalTimer;
    const privateMask = '*******';
    const cleanRawCmd = opts.rawCommand?.args || [];

    if (cleanRawCmd.length) {
        cleanCommand += ` ${cleanRawCmd.join(' ')}`;
    }

    let logMessage = cleanCommand;
    const privateParams = mergedOpts.privateParams || [];
    if (privateParams?.length) {
        logMessage = replaceOverridesInString(commandAsString, privateParams, privateMask);
    }

    if (c.program.opts().printExec) {
        let logMsg = printableEnv ? `${chalk.grey(printableEnv)} ${logMessage}` : logMessage;
        if (opts.cwd) {
            logMsg = `cd ${opts.cwd} ${chalk.cyan('&&')} ${logMsg}`;
        }
        logRaw(`${blue2('exec:')} ${blue2('○')} ${logMsg} ${blue2('○')}`);
    }

    logDebug(`_execute: ${logMessage}`);
    const { silent, mono, maxErrorLength, ignoreErrors } = mergedOpts;
    const spinner =
        !silent &&
        !mono &&
        getApi()
            .spinner({ text: `Executing: ${logMessage}` })
            .start('');

    if (mono) {
        interval = setInterval(() => {
            logRaw(`Executing: ${logMessage} - ${timer / 1000}s`);
            timer += intervalTimer;
        }, intervalTimer);
    }
    let child: Subprocess;
    if (opts.rawCommand) {
        const { args } = opts.rawCommand;
        child = execa(commandAsString, args, Object.assign({ shell: true }, mergedOpts));
    } else {
        child = execa(cleanCommand, Object.assign({ shell: true }, mergedOpts));
    }

    if (!opts.detached) {
        c.runningProcesses.push(child);
    }

    const MAX_OUTPUT_LENGTH = 200;

    const printLastLine = (buffer: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>) => {
        const text = Buffer.from(buffer).toString().trim();
        const lastLine = text.split('\n').pop() || '';
        if (spinner !== false) {
            spinner.text = replaceOverridesInString(
                lastLine?.substring(0, MAX_OUTPUT_LENGTH),
                privateParams || [],
                privateMask
            );
        }

        if (lastLine?.length === MAX_OUTPUT_LENGTH) {
            if (spinner !== false) spinner.text += '...\n';
        }
    };

    if (c.program?.opts().info && child?.stdout?.pipe) {
        child.stdout.pipe(process.stdout);
    } else if (spinner && child?.stdout?.on) {
        child.stdout.on('data', printLastLine);
    }

    return await new Promise((res, rej) => {
        child
            .then(({ stdout }) => {
                if (child?.stdout?.off && spinner) {
                    child.stdout.off('data', printLastLine);
                }
                if (!silent && !mono && spinner) spinner.succeed(`Executing: ${logMessage}`);
                logDebug(replaceOverridesInString(String(stdout), privateParams, privateMask));
                if (interval) clearInterval(interval);
                c.runningProcesses.splice(c.runningProcesses.indexOf(child), 1);
                res(stdout);
            })
            .catch((err) => {
                if (child?.stdout?.off && spinner) {
                    child.stdout.off('data', printLastLine);
                }
                if (!silent && !mono && !ignoreErrors && spinner) {
                    spinner.fail(`FAILED: ${logMessage}`);
                } // parseErrorMessage will return false if nothing is found, default to previous implementation
                logDebug(replaceOverridesInString(err.all, privateParams, privateMask));
                if (interval) clearInterval(interval);
                if (ignoreErrors && !silent && !mono && spinner) {
                    spinner.succeed(`Executing: ${logMessage}`);
                    return res('');
                }

                let errMessage = '';

                if (!opts.stdio) {
                    //In stdio mode all info received at summary so we want to skip doubles
                    errMessage = parseErrorMessage(err.all, maxErrorLength);
                }

                if (!errMessage) {
                    errMessage = '';
                } else {
                    errMessage += '\n\n';
                }

                if (err.stack && !errMessage.includes(err.stack)) {
                    errMessage += `${err.stack}\n\n`;
                }

                if (err.all && !errMessage.includes(err.all)) {
                    errMessage += `${err.all}\n\n`;
                }

                if (err.message && !errMessage.includes(err.message)) {
                    errMessage += `${err.message}\n\n`;
                }

                if (err.stderr && !errMessage.includes(err.stderr)) {
                    errMessage += `${err.stderr}\n\n`;
                }

                errMessage = replaceOverridesInString(errMessage, privateParams, privateMask);
                c.runningProcesses.splice(c.runningProcesses.indexOf(child), 1);

                rej(`COMMAND: \n\n${logMessage} \n\nFAILED with ERROR: \n\n${errMessage}`); // parseErrorMessage will return false if nothing is found, default to previous implementation
            });
    });
};

const execCLI = async (cli: string, command: string, opts: ExecOptions = {}) => {
    const c = getContext();

    if (!c.program) {
        throw new Error('You need to pass c object as first parameter to execCLI()');
    }
    const p = c.cli[cli];
    if (!fsExistsSync(p)) {
        logDebug(
            `execCLI error: ${cli} | ${command}`,
            '\nCLI Config:\n',
            c.cli,
            '\nSDK Config:\n',
            c.buildConfig?.sdks
        );
        throw new Error(
            `Location of your cli ${chalk.bold.white(p)} does not exists. check your ${chalk.bold.white(
                c.paths.workspace.config
            )} file if your ${chalk.bold.white('sdks')} paths are correct`
        );
    }

    return await _execute(c, `"${p}" ${command}`, { ...opts, shell: true });
};

/**
 *
 * Execute a plain command
 *
 * @param {String} command - the command to be executed
 * @param {Opts} [opts={}] - the options for the command
 * @returns {Promise}
 *
 */

const executeAsync = async (cmd: string | Array<string>, opts?: ExecOptions): Promise<string> => {
    const c = getContext();
    // change to pnpm
    if (cmd.includes('npm') && process.platform === 'win32') {
        if (typeof cmd === 'string') {
            cmd.replace('npm', 'npm.cmd');
        } else {
            cmd = cmd.map((c) => c.replace('npm', 'npm.cmd'));
        }
    }

    const result = await _execute(c, cmd, opts);
    return String(result);
};

export const execaCommand = (cmd: string, options?: ExecaOptions) => {
    return execa(cmd, Object.assign({ shell: true }, options));
};

// Connect to a local telnet server and execute a command
const executeTelnet = (port: string, command: string) =>
    new Promise<string>((resolve) => {
        logDebug(`execTelnet: ${port} ${command}`);
        const c = getContext();
        try {
            const socket = net.createConnection({ port: Number(port), host: c.runtime.localhost as string });
            const timeout = setTimeout(() => {
                logError('Timed out, 30s');
                socket.destroy();
                resolve('');
            }, 30_000);
            let output = '';
            socket.on('connect', () => {
                socket.write(`${command}\n`);
            });
            socket.on('data', (data: Buffer) => {
                output += data.toString();
                if (output.includes('OK')) {
                    socket.end();
                }
            });
            socket.on('close', () => {
                clearTimeout(timeout);
                resolve(output);
            });
            socket.setTimeout(10000, () => {
                logError('socket idle for 10s');
                socket.destroy();
                resolve('');
            });
            socket.on('error', (err) => {
                clearTimeout(timeout);
                socket.destroy();
                logError(err);
                resolve('');
            });
        } catch (err) {
            logError(err);
            resolve('');
        }
    });

export const parseErrorMessage = (text: string, maxErrorLength = 800) => {
    if (!text) return '';
    // Gradle specific
    const gradleFailIndex = text.indexOf('FAILURE: Build failed with an exception.');
    if (gradleFailIndex !== -1) {
        return text.substring(gradleFailIndex);
    }
    // NextJS Specific
    const nextFailIndex = text.indexOf('> Build error occurred');
    if (nextFailIndex !== -1) {
        return text.substring(nextFailIndex);
    }
    const toSearch = /(exception|error|fatal|\[!])/i;
    let arr = text.split('\n');

    let errFound = 0;
    arr = arr.filter((v) => {
        if (v === '') return false;
        // Cleaner iOS reporting
        if (
            v.includes('-Werror') ||
            v.includes('following modules are linked manually') ||
            v.includes('warn ') ||
            v.includes('note: ') ||
            v.includes('warning: ') ||
            v.includes('Could not find the following native modules') ||
            v.includes('⚠️') ||
            v.includes('/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain')
        ) {
            return false;
        }
        // Cleaner Android reporting
        if (
            v.includes('[DEBUG]') ||
            v.includes('[INFO]') ||
            v.includes('[LIFECYCLE]') ||
            v.includes('[WARN]') ||
            v.includes(':+HeapDumpOnOutOfMemoryError') ||
            v.includes('.errors.') ||
            v.includes('-exception-') ||
            v.includes('error_prone_annotations')
        ) {
            return false;
        }
        if (v.search(toSearch) !== -1) {
            errFound = 5;
            return true;
        }
        if (errFound > 0) {
            errFound -= 1;
            return true;
        }

        return false;
    });

    arr = arr.map((str) => {
        const v = str.replace(/\s{2,}/g, ' ');
        let extractedError = v.substring(0, maxErrorLength);
        if (extractedError.length === maxErrorLength) extractedError += '...';
        return extractedError;
    });

    return arr.join('\n');
};

const isUsingWindows = process.platform === 'win32';

const fileNotExists = (commandName: string, callback: (isError: boolean) => void) => {
    access(commandName, constants.F_OK, (err) => {
        callback(!err);
    });
};

const fileNotExistsSync = (commandName: string) => {
    try {
        accessSync(commandName, constants.F_OK);
        return false;
    } catch (_e) {
        return true;
    }
};

const localExecutable = (commandName: string, callback?: ExecCallback) => {
    access(commandName, constants.F_OK | constants.X_OK, (err) => {
        callback?.(null, !err);
    });
};

const localExecutableSync = (commandName: string) => {
    try {
        accessSync(commandName, constants.F_OK | constants.X_OK);
        return true;
    } catch (_e) {
        return false;
    }
};

const commandExistsUnix = (commandName: string, cleanedCommandName: string, callback?: ExecCallback) => {
    fileNotExists(commandName, (isFile: boolean) => {
        if (!isFile) {
            exec(
                `command -v ${cleanedCommandName} 2>/dev/null` + ` && { echo >&1 ${cleanedCommandName}; exit 0; }`,
                (_error: unknown, stdout: unknown) => {
                    callback?.(null, !!stdout);
                }
            );
            return;
        }

        localExecutable(commandName, callback);
    });
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally checking for control characters
const contains0to31 = /[\x00-\x1f<>:"|?*]/;
const commandExistsWindows = (commandName: string, cleanedCommandName: string, callback?: ExecCallback) => {
    if (contains0to31.test(commandName)) {
        callback?.(null, false);
        return;
    }
    exec(`where ${cleanedCommandName}`, (error: unknown) => {
        callback?.(null, error === null);
    });
};

const commandExistsUnixSync = (commandName: string, cleanedCommandName: string) => {
    if (fileNotExistsSync(commandName)) {
        try {
            const stdout = execSync(
                `command -v ${cleanedCommandName} 2>/dev/null` + ` && { echo >&1 ${cleanedCommandName}; exit 0; }`
            );
            return !!stdout;
        } catch (_error) {
            return false;
        }
    }
    return localExecutableSync(commandName);
};

const commandExistsWindowsSync = (commandName: string, cleanedCommandName: string) => {
    if (contains0to31.test(commandName)) {
        return false;
    }
    try {
        const stdout = execSync(`where ${cleanedCommandName}`, { stdio: [] });
        return !!stdout;
    } catch (_error) {
        return false;
    }
};

let cleanInput = (_s: string) => {
    let s = _s;
    if (/[^A-Za-z0-9_/:=-]/.test(s)) {
        s = `'${s.replace(/'/g, "'\\''")}'`;
        s = s
            .replace(/^(?:'')+/g, '') // unduplicate single-quote at the beginning
            .replace(/\\'''/g, "\\'"); // remove non-escaped single-quote if there are enclosed between 2 escaped
    }
    return s;
};

if (isUsingWindows) {
    cleanInput = (s) => {
        const isPathName = /[\\]/.test(s);
        if (isPathName) {
            const dirname = `"${path.dirname(s)}"`;
            const basename = `"${path.basename(s)}"`;
            return `${dirname}:${basename}`;
        }
        return `"${s}"`;
    };
}

const commandExists = (commandName: string, callback?: ExecCallback) => {
    const cleanedCommandName = cleanInput(commandName);
    if (!callback && typeof Promise !== 'undefined') {
        return new Promise((resolve, reject) => {
            commandExists(commandName, (error, output) => {
                if (output) {
                    resolve(commandName);
                } else {
                    reject(error);
                }
            });
        });
    }
    if (isUsingWindows) {
        commandExistsWindows(commandName, cleanedCommandName, callback);
    } else {
        commandExistsUnix(commandName, cleanedCommandName, callback);
    }
};

const commandExistsSync = (commandName: string) => {
    const cleanedCommandName = cleanInput(commandName);
    if (isUsingWindows) {
        return commandExistsWindowsSync(commandName, cleanedCommandName);
    }
    return commandExistsUnixSync(commandName, cleanedCommandName);
};

// eslint-disable-next-line no-nested-ternary
const openCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

export const waitForExecCLI = async (
    cli: string,
    command: string,
    callback: (resp: string | true) => boolean
): Promise<boolean> => {
    const c = getContext();
    let attempts = 0;
    const maxAttempts = 30;
    const CHECK_INTEVAL = 2000;
    const { maxErrorLength } = c.program.opts();
    const spinner = getApi().spinner('Waiting for emulator to boot...').start('');

    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            execCLI(cli, command, {
                silent: true,
                timeout: 10000,
                maxErrorLength
            })
                .then((resp) => {
                    if (callback(resp as string | true)) {
                        clearInterval(interval);
                        spinner.succeed('');
                        return resolve(true);
                    }
                    attempts++;
                    if (attempts === maxAttempts) {
                        clearInterval(interval);
                        spinner.fail("Can't connect to the running emulator. Try restarting it.");
                        return reject("Can't connect to the running emulator. Try restarting it.");
                    }
                })
                .catch(() => {
                    attempts++;
                    if (attempts > maxAttempts) {
                        clearInterval(interval);
                        spinner.fail("Can't connect to the running emulator. Try restarting it.");
                        return reject("Can't connect to the running emulator. Try restarting it.");
                    }
                });
        }, CHECK_INTEVAL);
    });
};

export { commandExists, commandExistsSync, execCLI, executeAsync, executeTelnet, openCommand };

export default {
    executeAsync,
    execCLI,
    openCommand,
    executeTelnet,
    commandExistsSync
};
