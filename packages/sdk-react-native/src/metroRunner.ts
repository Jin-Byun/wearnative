import {
    CoreEnvVars,
    chalk,
    type ExecOptions,
    executeAsync,
    getContext,
    logDefault,
    logError,
    logInfo,
    logRaw,
    type RnvPlatformKey
} from '@rnv/core';
import { confirmActiveBundler, getEntryFile } from '@rnv/sdk-utils';
import { isBundlerActive } from './common';
import { EnvVars } from './env';

const BUNDLER_PLATFORMS: Partial<Record<RnvPlatformKey, RnvPlatformKey>> = {};

BUNDLER_PLATFORMS.android = 'android';
BUNDLER_PLATFORMS.androidwear = 'android';

type StartOption = {
    waitForBundler?: boolean;
    customCliPath?: string;
    metroConfigName?: string;
};

export const startReactNative = async ({ waitForBundler, customCliPath, metroConfigName }: StartOption) => {
    const c = getContext();
    logDefault('startReactNative');

    if (!c.platform) return false;

    // start command setup
    const flags = [`--port ${c.runtime.port}`, '--no-interactive', !!metroConfigName && `--config=${metroConfigName}`];
    if (c.program.opts().resetHard || c.program.opts().reset) {
        flags.push('--reset-cache');
        logInfo(`You passed ${chalk.bold.white('-r')} argument. --reset-cache will be applied to react-native`);
    }
    const buildCmd = customCliPath ? `node ${customCliPath.replaceAll(' ', '\\ ')}` : 'npx react-native';
    const startCmd = `${buildCmd} start ${flags.filter(Boolean).join(' ')}`;

    const url = chalk.cyan(
        `http://${c.runtime.localhost}:${c.runtime.port}/${getEntryFile()}.bundle?platform=${
            BUNDLER_PLATFORMS[c.platform]
        }`
    );
    logRaw(`\nDev server running at: ${url}\n`);

    const baseExecOption: ExecOptions = {
        stdio: 'inherit',
        silent: true,
        env: Object.assign(
            {},
            CoreEnvVars.BASE(),
            CoreEnvVars.RNV_EXTENSIONS(),
            EnvVars.RNV_REACT_NATIVE_PATH(),
            EnvVars.RNV_APP_ID()
        )
    };
    if (waitForBundler) {
        const isRunning = await isBundlerActive();
        const resetCompleted = isRunning && (await confirmActiveBundler());

        if (!isRunning || resetCompleted) {
            Object.assign(baseExecOption.env as Record<string, any>, EnvVars.RCT_NO_LAUNCH_PACKAGER());
            return executeAsync(startCmd, baseExecOption);
        }
        return true;
    }
    executeAsync(startCmd, baseExecOption).catch((e) => logError(e));
    return true;
};
