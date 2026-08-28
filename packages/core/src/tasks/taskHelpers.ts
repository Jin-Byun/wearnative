import { inquirerPrompt } from '../api';
import { getContext } from '../context/provider';
import { getEngineRunnerByPlatform, registerPlatformEngine } from '../engines';
import { chalk, logInfo } from '../logger';
import { RnvTask, RnvTaskOption } from './types';

const printCurrentPlatform = () => {
    const ctx = getContext();
    const msg = `Current platform: ${chalk().bold.white(ctx.platform)}`;
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
        const taskName = getTaskNameFromCommand();
        const platforms =
            knownTaskInstance?.platforms?.filter((p) => c.runtime.availablePlatforms.includes(p)) ||
            c.runtime.availablePlatforms;
        if (platforms) {
            if (platforms.length === 1) {
                logInfo(
                    `Task "${knownTaskInstance?.task}" has only one supported platform: "${platforms[0]}". Automatically selecting it.`
                );
                c.platform = platforms[0];
                // after making UTs, this doesn't work - no changes happen, so commenting it out
            } else {
                const { platform } = await inquirerPrompt({
                    type: 'list',
                    name: 'platform',
                    message: `Pick a platform for task: "rnv ${knownTaskInstance?.task || taskName}"`,
                    choices: platforms,
                });
                c.platform = platform;
            }
            printCurrentPlatform();
        }
    } else {
        printCurrentPlatform();
    }
    // TODO: move all below to more generic place?
    if (registerEngineIfPlatformSelected) {
        await registerPlatformEngine(c.platform);
    }
    c.runtime.engine = getEngineRunnerByPlatform(c.platform);
    c.runtime.runtimeExtraProps = c.runtime.engine?.runtimeExtraProps || {};
};

export const getTaskNameFromCommand = (): string | undefined => {
    const c = getContext();
    if (!c.command) return undefined;
    let taskName = '';

    if (c.command) taskName = c.command;
    if (c.subCommand) taskName += ` ${c.subCommand}`;

    return taskName;
};

const valueBracket = (vr: boolean, vt: boolean, ir: boolean): string => {
  if (!vr && !vt) return '';
  const s = `value${vr ? '...' : ''}`;
  return ir ? ` <${s}>` : ` [${s}]`
}
export const generateStringFromTaskOption = ({shortcut, key, altKey, isVariadic, isRequired, isValueType}: RnvTaskOption) => {
  const sc = shortcut ? `-${shortcut}, ` : '';
  const ak = shortcut ? `, --${altKey}` : '';
    return `${sc}--${key}${ak}${valueBracket(isVariadic, isValueType, isRequired)}`;
};

// const ACCEPTED_CONDITIONS = ['platform', 'target', 'appId', 'scheme'] as const;

export const shouldSkipTask = ({ taskName }: { taskName: string }) => {
    const c = getContext();
    const tasks = c.buildConfig?.tasks;
    c.runtime.platform = c.platform;
    if (!tasks) return false;

    if (c.program.opts().skipTasks?.split) {
        const skipTaskArr = c.program.opts().skipTasks.split(',');
        if (skipTaskArr.includes(taskName)) return true;
    }
    return false;
};
