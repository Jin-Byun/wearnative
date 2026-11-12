import { inquirerPrompt } from '../api';
import { getContext } from '../context/provider';
import { getEngineRunnerByPlatform, registerPlatformEngine } from '../engines';
import { chalk, logInfo } from '../logger';
import type { RnvPlatform } from '../types';
import type { RnvTask, RnvTaskOption } from './types';

const printCurrentPlatform = () => {
    const ctx = getContext();
    const msg = `Current platform: ${chalk.bold.white(ctx.platform)}`;
    logInfo(msg);
};

export const selectPlatformIfRequired = async (
    knownTaskInstance?: RnvTask<string>,
    registerEngineIfPlatformSelected?: boolean
) => {
    const c = getContext();
    // TODO: move this to more generic place?
    c.runtime.availablePlatforms = c.buildConfig.defaults?.supportedPlatforms || [];
    if (typeof c.platform !== 'string') {
        const platforms =
            knownTaskInstance?.platforms?.filter((p) => c.runtime.availablePlatforms.includes(p)) ||
            c.runtime.availablePlatforms;
        if (platforms.length === 1) {
            logInfo(
                `Task "${knownTaskInstance?.task}" has only one supported platform: "${platforms[0]}". Automatically selecting it.`
            );
            c.platform = platforms[0];
        } else {
            const platform = (await inquirerPrompt({
                type: 'list',
                name: 'platform',
                message: `Pick a platform for task: "rnv ${knownTaskInstance?.task || getTaskNameFromCommand()}"`,
                choices: platforms
            })) as RnvPlatform;
            c.platform = platform;
        }
    }
    printCurrentPlatform();
    // TODO: move all below to more generic place?
    if (registerEngineIfPlatformSelected) {
        await registerPlatformEngine(c.platform);
    }
    c.runtime.engine = getEngineRunnerByPlatform(c.platform);
    c.runtime.runtimeExtraProps = c.runtime.engine?.runtimeExtraProps ?? {};
};

export const getTaskNameFromCommand = (): string | undefined => {
    const c = getContext();
    if (!c.command) return undefined;
    return `${c.command}${c.subCommand ? ` ${c.subCommand}` : ''}`;
};

const valueBracket = (vr?: boolean, vt?: boolean, ir?: boolean): string => {
    if (!vr && !vt) return '';
    const s = `value${vr ? '...' : ''}`;
    return ir ? ` <${s}>` : ` [${s}]`;
};
export const generateStringFromTaskOption = ({
    shortcut,
    key,
    altKey,
    isVariadic,
    isRequired,
    isValueType
}: RnvTaskOption) => {
    const sc = shortcut ? `-${shortcut}, ` : '';
    const ak = shortcut ? `, --${altKey}` : '';
    return `${sc}--${key}${ak}${valueBracket(isVariadic, isValueType, isRequired)}`;
};

export const shouldSkipTask = ({ taskName }: { taskName: string }) => {
    const c = getContext();
    c.runtime.platform = c.platform;
    if (!c.buildConfig?.tasks) return false;
    return c.program.opts().skipTasks?.split?.(',').includes(taskName) ?? false;
};
