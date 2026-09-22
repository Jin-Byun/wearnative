import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { getContext, isSystemWin, type RnvApiLogger, type RnvContext } from '@rnv/core';
import { Chalk, type ChalkInstance } from 'chalk';

const { log } = console;
const ICN_ROCKET = isSystemWin ? 'RNV' : '🚀';
const PRIVATE_PARAMS = ['-k', '--key'];

const colorBlue = '#0a74e6';

export const chalk = new Chalk({ level: 1 });
const chalkBlue = chalk.hex(colorBlue);

let _isInfoEnabled = false;
let _infoFilter: Array<string> = [];
const _defaultColor = chalk.white;
const _highlightColor = chalk.bold.white;
let _jsonOnly: boolean;

const isHelp = (ctx?: RnvContext): boolean => {
    if (!ctx) {
        ctx = getContext();
    }
    return !!ctx.program?.opts().help;
};
export const logInitialize = () => {
    const ctx = getContext();

    _infoFilter = ctx.program.opts().info?.split?.(',');
    _jsonOnly = !!ctx.program.opts().json;
    _isInfoEnabled = !!_infoFilter?.length;

    if (ctx.program.opts().mono) {
        chalk.level = 0;
    }
    if (!_jsonOnly) logWelcome();
};

export const logWelcome = () => {
    const ctx = getContext();
    if (isHelp(ctx) || ctx.program?.opts().noIntro) return;
    const shortLen = 64;
    let str = _defaultColor(`
┌─────────────────────────────────────────────────────────────────┐
│ ${chalkBlue('██████╗')} ███████╗${chalkBlue('███╗   ██╗')} █████╗ ████████╗██╗${chalkBlue('██╗   ██╗')}███████╗ │
│ ${chalkBlue('██╔══██╗')}██╔════╝${chalkBlue('████╗  ██║')}██╔══██╗╚══██╔══╝██║${chalkBlue('██║   ██║')}██╔════╝ │
│ ${chalkBlue('██████╔╝')}█████╗  ${chalkBlue('██╔██╗ ██║')}███████║   ██║   ██║${chalkBlue('██║   ██║')}█████╗   │
│ ${chalkBlue('██╔══██╗')}██╔══╝  ${chalkBlue('██║╚██╗██║')}██╔══██║   ██║   ██║${chalkBlue('╚██╗ ██╔╝')}██╔══╝   │
│ ${chalkBlue('██║  ██║')}███████╗${chalkBlue('██║ ╚████║')}██║  ██║   ██║   ██║${chalkBlue(' ╚████╔╝ ')}███████╗ │
│ ${chalkBlue('╚═╝  ╚═╝')}╚══════╝${chalkBlue('╚═╝  ╚═══╝')}╚═╝  ╚═╝   ╚═╝   ╚═╝${chalkBlue('  ╚═══╝  ')}╚══════╝ │
`);

    if (ctx.files?.rnv?.package?.version) {
        ctx.rnvVersion = ctx.files.rnv.package.version;
        str += printIntoBox(
            chalk.grey(
                `${chalk.level ? ICN_ROCKET : 'RNV'} v:${
                    ctx.rnvVersion
                } | 'renative.org' | ${ctx.timeStart.toLocaleString()}`
            ),
            shortLen
        );
        if (ctx.rnvVersion?.includes?.('alpha')) {
            str += printIntoBox(`${chalk.yellow('WARNING: this is a prerelease version.')}`, shortLen);
        }
    }
    str += printIntoBox(`$ ${_highlightColor(getCurrentCommand(true))}`, shortLen);
    if (ctx.timeStart) {
        str += _defaultColor('└─────────────────────────────────────────────────────────────────┘');
    }
    log(str);
};

export function stripAnsi(string: string) {
    try {
        return stripVTControlCharacters(string);
    } catch (err) {
        if (typeof string !== 'string') {
            throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
        }
        throw new Error(`Unexpected Error: ${err}`);
    }
}

export const logAndSave = (msg: string, skipLog?: boolean) => {
    const ctx = getContext();
    if (ctx.logging?.logMessages && !ctx.logging.logMessages.includes(msg)) ctx.logging?.logMessages.push(msg);
    if (!skipLog) log(`${msg}`);
};

const _printJson = (obj: PrintJsonPayload) => {
    // sanitize
    if (obj.task) {
        obj.task = obj.task.trim().replace(/[[\]]/g, '');
    }
    log(JSON.stringify(obj));
};

export const getCurrentCommand = (excludeDollar = false) => {
    const ctx = getContext();

    const argArr = ctx.process.argv.slice(2);
    const n = argArr.length;
    let msg = `${excludeDollar ? '' : '$ '}${ctx.paths.IS_NPX_MODE ? 'npx ' : ''}rnv`;
    for (let i = 0; i < n; i++) {
        let v = argArr[i];
        if (PRIVATE_PARAMS.includes(v)) {
            v += ' ********';
            i++;
        }
        msg += ` ${v}`;
    }
    return msg;
};

export const logToSummary = (v: string) => {
    const ctx = getContext();
    if (isHelp(ctx)) return;
    ctx.logging.logMessages.push(`\n${_sanitizePaths(v)}`);
};

export const logRaw = (...args: Array<string>) => {
    if (_jsonOnly) {
        return _printJson({
            type: 'rawLog',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(JSON.stringify(args)))
        });
    }
    log.apply(null, args);
};

export const logSummary = (opts?: { header?: string; headerStyle?: 'success' | 'warning' | 'error' | 'none' }) => {
    const ctx = getContext();
    if (isHelp(ctx)) return;
    if (_jsonOnly) {
        if (!ctx.logging.logMessages?.length) {
            return;
        }
        const cleanedMessages = ctx.logging.logMessages
            .map((raw) => {
                const msg = stripAnsi(raw);
                const headerEndIndex = msg.indexOf(':') + 1;
                const header = msg.slice(0, headerEndIndex).trim();
                const items = msg
                    .slice(headerEndIndex)
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line)
                    .join(', ');
                return `${header} ${items}`;
            })
            .join('');
        return _printJson({
            type: 'summaryLog',
            task: stripAnsi(_getCurrentTask()),
            message: cleanedMessages
        });
    }

    if (ctx.program?.opts().noSummary) {
        if (ctx.logging.logMessages?.length) {
            log(ctx.logging.logMessages.join('').replace(/\n\s*\n\s*\n/g, '\n\n'));
        }
        return;
    }

    if (ctx.paths.project.configExists && !ctx.paths.IS_NPX_MODE && !ctx.paths.IS_LINKED) {
        logAndSave(chalk.yellow('You are trying to run global rnv command in your current project.'), true);
        logAndSave(chalk.yellow('This might lead to unexpected behaviour.'), true);
        logAndSave(chalk.yellow('Run your rnv command with npx prefix:'), true);
        logAndSave(chalk.bold(`npx ${getCurrentCommand(true)}`), true);
    }

    const headerData = {
        error: {
            prefix: '⨯ ',
            chalk: chalk.red.bold
        },
        warning: {
            prefix: '⚠ ',
            chalk: chalk.yellow.bold
        },
        success: {
            prefix: '✔ ',
            chalk: chalk.green.bold
        },
        none: {
            prefix: '',
            chalk
        }
    };
    const defaultHeaderStyle = ctx.logging.containsError
        ? 'error'
        : ctx.logging.containsWarning
          ? 'warning'
          : 'success';
    const headerStyle = opts?.headerStyle || defaultHeaderStyle;

    const headerTextPlain = `${headerData[headerStyle].prefix}${opts?.header || 'SUMMARY'}`;

    const str = new Array<string>(18); // currently has 18 fields.
    ctx.timeEnd = new Date();
    str[14] = printIntoBox(`Executed Time: ${chalk.gray(_msToTime(ctx.timeEnd.getTime() - ctx.timeStart.getTime()))}`);

    str[0] = printBoxStart(
        `${headerData[headerStyle].chalk(headerTextPlain)} | ${ctx.timeEnd.toLocaleString()} | rnv@${ctx.rnvVersion}`,
        getCurrentCommand()
    );

    if (ctx.runtime?.platformBuildsProjectPath) {
        str[16] = printIntoBox(
            `Project location: ${chalk.gray(_sanitizePaths(ctx.runtime.platformBuildsProjectPath || ''))}`
        );
    }
    str[17] = printBoxEnd();

    if (ctx.files?.project?.package?.name && ctx.files?.project?.package?.version) {
        str[1] = printIntoBox(
            `Project: ${chalk.gray(`${ctx.files.project.package.name}@${ctx.files.project.package.version}`)}`
        );
    }
    const { buildConfig, platform, runtime, program, process } = ctx;
    if (buildConfig) {
        if (buildConfig.workspaceID) {
            str[2] = printIntoBox(`Workspace: ${chalk.gray(buildConfig.workspaceID)}`);
        }
        if (buildConfig._meta?.currentAppConfigId) {
            str[6] = printIntoBox(`App Config (-c): ${_highlightColor(buildConfig._meta.currentAppConfigId)}`);
        }
    }
    if (platform) {
        str[3] = printIntoBox(`Platform (-p): ${_highlightColor(platform)}`);
    }
    if (runtime) {
        if (runtime.engine) {
            str[4] = printIntoBox(`Engine: ${chalk.gray(runtime.engine.id || '')}`);
        }
        if (runtime.currentTemplate) {
            str[5] = printIntoBox(`Template: ${chalk.gray(runtime.currentTemplate)}`);
        }
        if (runtime.scheme) {
            str[7] = printIntoBox(`Build Scheme (-s): ${_highlightColor(runtime.scheme)}`);
        }
        if (runtime.bundleAssets) {
            str[8] = printIntoBox(
                `Bundle assets ($.platforms.${platform}.bundleAssets): ${_highlightColor(!!runtime.bundleAssets)}`
            );
        }
        if (runtime.target) {
            str[9] = printIntoBox(`Target (-t): ${_highlightColor(runtime.target)}`);
        }
        if (runtime.availablePlatforms?.length) {
            str[12] = printIntoBox(`Supported Platforms: ${chalk.gray(runtime.availablePlatforms.join(', '))}`);
        }
    }
    if (program) {
        if (program.opts()?.reset) {
            str[10] = printIntoBox(`Reset Project (-r): ${_highlightColor(!!program.opts().reset)}`);
        }
        if (program.opts()?.resetHard) {
            str[11] = printIntoBox(`Reset Project and Assets (-R): ${_highlightColor(!!program.opts().resetHard)}`);
        }
    }

    if (process) {
        const envString = `${process.platform} | ${process.arch} | node v${process.versions?.node}`;
        str[13] = printIntoBox(`Env Info: ${chalk.gray(envString)}`);
    }

    if (ctx.logging.logMessages?.length) {
        str[15] = ctx.logging.logMessages
            .map((m) => `│ ${m}`)
            .join('\n')
            .replace(/\n\s*\n\s*\n/g, '\n\n');
    }

    log(str.filter((v) => v).join(''));
};

const _msToTime = (diff: number) => {
    const ms = diff % 1000;
    diff = (diff / 1000) | 0;
    const secs = diff % 60;
    diff = (diff / 60) | 0;
    const mins = diff % 60;
    const hrs = diff / 60;

    return `${hrs.toFixed(0)}h:${mins}m:${secs}s:${ms}ms`;
};

const _getCurrentTask = () => {
    const ctx = getContext();
    if (!ctx._currentTask) return '';
    return chalk.grey(`○ ${ctx._currentTask}:`);
};

const cwd = process.cwd().normalize();
const CWD_ARR: Array<{ path: string; relative: string }> = Array.from(
    {
        length: cwd.split(path.sep).length - 1
    },
    (_, i) => {
        if (i === 0) return { path: cwd, relative: '.' };
        const relative = '/..'.repeat(i).slice(1);
        return { path: path.join(cwd, relative), relative };
    }
);

const _sanitizePaths = (msg: string) => {
    if (msg?.replaceAll) {
        for (const { path, relative } of CWD_ARR) {
            msg = msg.replaceAll(path, relative);
        }
    }
    return msg;
};

const TASK_COUNTER: Record<string, number> = {};

export const logTask = (task: string, customChalk?: string | ChalkInstance) => {
    if (isHelp()) return;
    const taskCount = getLogCounter(task);

    if (_jsonOnly) {
        return _printJson({
            type: 'task',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(typeof customChalk === 'string' ? customChalk : task))
        });
    }
    if (!_isInfoEnabled) {
        return;
    }
    const taskChalk = typeof customChalk === 'function' ? customChalk : chalk.green;
    const chalkMessage = typeof customChalk === 'string' ? customChalk : '';
    const msg = `${taskChalk(`[task]${_getCurrentTask()}`)} ${task}${taskCount} ${chalkMessage}`;
    log(_sanitizePaths(msg));
};

export const logDefault = (task: string, customChalk?: string | ChalkInstance) => {
    if (isHelp()) return;
    const taskCount = getLogCounter(task);

    if (_jsonOnly) {
        return _printJson({
            type: 'log',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(typeof customChalk === 'string' ? customChalk : task))
        });
    }
    if (!_isInfoEnabled) {
        return;
    }

    const thisChalk = typeof customChalk === 'function' ? customChalk : chalk;
    const chalkMessage = typeof customChalk === 'string' ? chalk.grey(customChalk) : '';
    const msg = thisChalk(`[log]${_getCurrentTask()} ${task} ${taskCount} ${chalkMessage}`);

    log(_sanitizePaths(msg));
};

const getLogCounter = (task: string, skipAddition = false) => {
    if (!TASK_COUNTER[task]) TASK_COUNTER[task] = 0;
    if (!skipAddition) {
        TASK_COUNTER[task] += 1;
    }

    const taskCount = chalk.grey(`↺${TASK_COUNTER[task]}`);
    return taskCount;
};

export const logInitTask = (task: string) => {
    if (isHelp()) return;
    const taskCount = getLogCounter(task);

    if (_jsonOnly) {
        return _printJson({
            type: 'taskInit',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(task))
        });
    }
    const msg = `${chalkBlue.bold('task:')} ○ ${task} ${taskCount}`;

    log(msg);
};

type PrintJsonPayload = {
    type: string;
    task?: string;
    message: string;
    hook?: string;
    level?: string;
};

export const logExitTask = (task: string) => {
    if (isHelp()) return;
    if (_jsonOnly) {
        return _printJson({
            type: 'taskExit',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(task))
        });
    }
    const msg = `${chalk.green('task:')} ${chalk.green('✔')} ${task}`;

    log(msg);
};

export const logHook = (hook = '', msg = '') => {
    if (isHelp()) return;
    if (_jsonOnly) {
        const payload: PrintJsonPayload = { type: 'hook', hook, message: stripAnsi(_sanitizePaths(msg)) };
        const task = _getCurrentTask();
        if (task) payload.task = stripAnsi(task);
        return _printJson(payload);
    }
    log(`${`[hook]`} ${_sanitizePaths(msg)}`);
};

export const logWarning = (msg: string | boolean | unknown, opts?: { skipSanitizePaths?: boolean }) => {
    const ctx = getContext();
    const skipSanitizePaths = opts?.skipSanitizePaths ?? false;
    const msgSn = typeof msg === 'string' && !skipSanitizePaths ? _sanitizePaths(msg) : String(msg);
    if (_jsonOnly) {
        return _printJson({
            type: 'log',
            level: 'warning',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(msgSn)
        });
    }
    ctx.logging.containsWarning = true;
    logAndSave(chalk.yellow(`warn: ${_getCurrentTask()} ${msgSn}`));
};

export const logInfo = (msg: string) => {
    if (isHelp()) return;
    if (_jsonOnly) {
        return _printJson({
            type: 'log',
            level: 'info',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(msg))
        });
    }
    log(`${_highlightColor('info:')} ${_sanitizePaths(msg)}`);
};

export const logDebug = (...args: Array<string>) => {
    if (!_isInfoEnabled) {
        return;
    }
    if (_jsonOnly) {
        return _printJson({
            type: 'log',
            level: 'debug',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(args.join(' ')))
        });
    }
    if (_infoFilter) {
        const [firstArg] = args;
        if (firstArg && _infoFilter.some((v) => firstArg.includes(v))) {
            log.apply(null, args);
        }
    } else {
        log.apply(null, args);
    }
};

export const isInfoEnabled = () => _isInfoEnabled;

export const logSuccess = (msg: string) => {
    if (_jsonOnly) {
        return _printJson({
            type: 'success',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(msg))
        });
    }
    logAndSave(`${chalk.magenta(`info: ✔`)} ${_sanitizePaths(msg)}`);
};

export const logError = (e: Error | string | unknown) => {
    const ctx = getContext();
    if (ctx.logging) {
        ctx.logging.containsError = true;
    }

    if (_jsonOnly) {
        let err = '';
        if (typeof e === 'string') {
            err = e;
        } else if (e instanceof Error) {
            err = e.message;
        }
        _printJson({
            type: 'log',
            level: 'error',
            task: stripAnsi(_getCurrentTask()),
            message: stripAnsi(_sanitizePaths(err))
        });
        return;
    }
    const logMessage = e instanceof Error ? `${e.stack || e}\n` : e;
    logAndSave(chalk.red(`error: ⨯ ${_getCurrentTask()} ${logMessage}`));
};

export const logAppInfo = (c: RnvContext) => {
    if (!_jsonOnly) {
        logInfo(`Current app config: ${_highlightColor(c.runtime.appId)}`);
    }
};

export const printIntoBox = (str: string, maxLen = 64) => {
    const len = maxLen - stripAnsi(str).length;
    const padEnd = len > 0 ? `${' '.repeat(len)}|` : '';
    return _defaultColor(`│ ${str}${padEnd}\n`);
};

export const printArrIntoBox = (arr: Array<string>, prefix = '') => {
    if (_jsonOnly) return arr.join(',');

    let stringArr = prefix;
    return arr
        .reduce((acc, v) => {
            if (stringArr.length > 60) {
                acc += printIntoBox(_defaultColor(stringArr));
                stringArr = '';
            }
            stringArr += `${v}, `;
            return acc;
        }, '')
        .concat('', printIntoBox(_defaultColor(stringArr.slice(0, -2))));
};

export const printBoxStart = (str: string, str2 = '') =>
    _defaultColor(`
┌─────────────────────────────────────────────────────────────────┐
${printIntoBox(str)}
${printIntoBox(str2)}
├─────────────────────────────────────────────────────────────────┤
`);

export const printBoxEnd = () => _defaultColor('└─────────────────────────────────────────────────────────────────┘');

const Logger: RnvApiLogger = {
    logHook,
    logInfo,
    logTask,
    logError,
    logDebug,
    logAppInfo,
    logDefault,
    logWarning,
    logSuccess,
    logWelcome,
    logInitialize,
    logAndSave,
    getCurrentCommand,
    logExitTask,
    logRaw,
    isInfoEnabled,
    logInitTask,
    logSummary,
    logToSummary,
    printArrIntoBox,
    printBoxEnd,
    printBoxStart,
    printIntoBox,
    chalk
};

export default Logger;
