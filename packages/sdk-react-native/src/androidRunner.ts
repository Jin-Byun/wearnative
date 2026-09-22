import path from 'node:path';
import {
    CoreEnvVars,
    chalk,
    DEFAULTS,
    ExecOptionsPresets,
    execCLI,
    executeAsync,
    getAppFolder,
    getConfigProp,
    getContext,
    inquirerPrompt,
    isSystemWin,
    logDefault,
    logInfo,
    logSuccess
} from '@rnv/core';
import { getEntryFile } from '@rnv/sdk-utils';
import { EnvVars } from './env';

export const packageReactNativeAndroid = async () => {
    const c = getContext();
    logDefault('packageAndroid');
    const { platform } = c;
    if (!platform) return;

    const bundleAssets = getConfigProp('bundleAssets') === true;
    if (!bundleAssets && platform !== 'androidwear') {
        logInfo(`bundleAssets in scheme ${chalk.bold.white(c.runtime.scheme)} marked false. SKIPPING PACKAGING...`);
        return true;
    }

    const outputFile = getEntryFile();
    const appFolder = getAppFolder();
    const AssetsDest = path.join(appFolder, 'app', 'src', 'main', 'res');
    const bundleOutput = path.join(AssetsDest, '..', 'assets', `${outputFile}.bundle`).replaceAll(' ', '\\ ');
    const reactNative = isSystemWin
        ? path.join(path.normalize(process.cwd()), 'node_modules', '.bin', 'react-native.cmd')
        : c.runtime.runtimeExtraProps?.reactNativePackageName || 'react-native';

    logInfo('ANDROID PACKAGE STARTING...');

    try {
        let cmd = `${reactNative} bundle --platform android --dev false --assets-dest ${AssetsDest.replaceAll(
            ' ',
            '\\ '
        )} --entry-file ${c.buildConfig.platforms?.[platform]?.entryFile}.js --bundle-output ${bundleOutput} --config=metro.config.js`;

        if (getConfigProp('enableSourceMaps')) {
            cmd += ` --sourcemap-output ${bundleOutput}.map`;
        }

        await executeAsync(cmd, {
            env: Object.assign(
                {},
                CoreEnvVars.BASE(),
                CoreEnvVars.RNV_EXTENSIONS(),
                EnvVars.RNV_REACT_NATIVE_PATH(),
                EnvVars.RNV_APP_ID(),
                EnvVars.RNV_SKIP_LINKING()
            )
        });

        logInfo('ANDROID PACKAGE FINISHED');
        return true;
    } catch (e) {
        logInfo('ANDROID PACKAGE FAILED');
        return Promise.reject(e);
    }
};

export const runReactNativeAndroid = async (device: { udid?: string } | undefined) => {
    const c = getContext();
    const { platform } = c;
    logDefault('_runGradleApp');

    const signingConfig = getConfigProp('signingConfig') || 'Debug';
    const appFolder = getAppFolder();

    const udid = device?.udid;
    // On Windows npx does not always resolve correct path, hence we manually resolve it here
    // https://github.com/flexn-io/renative/issues/1409#issuecomment-2095531486
    const reactNativeCmnd = `node "${path.join(path.dirname(require.resolve('react-native')), 'cli.js')}"`;
    // const reactNativeCmnd =  'npx react-native';

    let command = `${reactNativeCmnd} run-android --mode=${signingConfig} --no-packager --main-activity=${
        platform === 'androidwear' ? 'MainActivity' : 'SplashActivity'
    }`;

    if (udid) {
        command += ` --deviceId=${udid}`;
    }
    const executeCommand = async () => {
        return executeAsync(command, {
            env: {
                ...CoreEnvVars.BASE(),
                ...CoreEnvVars.RNV_EXTENSIONS(),
                ...EnvVars.RCT_METRO_PORT(),
                ...EnvVars.RNV_REACT_NATIVE_PATH(),
                ...EnvVars.RNV_APP_ID(),
                ...EnvVars.RNV_SKIP_LINKING()
            },
            cwd: appFolder,
            // To display react-native CLI logs in RNV executed terminal
            ...ExecOptionsPresets.INHERIT_OUTPUT_NO_SPINNER
        });
    };

    try {
        return await executeCommand();
    } catch (error) {
        const packageId = getConfigProp('id');
        if (packageId) {
            const { confirm } = await inquirerPrompt({
                name: 'confirm',
                type: 'confirm',
                message: `Failed to build the app. Try to uninstall and retry?`
            });

            if (confirm) {
                try {
                    await execCLI('androidAdb', `uninstall ${packageId}`, { silent: true });
                } catch {
                    return Promise.reject(`Failed to uninstall ${packageId}`);
                }

                return await executeCommand();
            }
            if (typeof error === 'string') {
                return Promise.reject(error);
            } else if (error instanceof Error) {
                return Promise.reject(error.message);
            }
        } else {
            if (typeof error === 'string') {
                return Promise.reject(error);
            } else if (error instanceof Error) {
                return Promise.reject(error.message);
            }
        }
    }
};

export const buildReactNativeAndroid = async () => {
    logDefault('buildAndroid');

    const appFolder = getAppFolder();
    const signingConfig = getConfigProp('signingConfig') || DEFAULTS.signingConfig;
    const outputAab = getConfigProp('aab');
    const extraGradleParams = getConfigProp('extraGradleParams') || '';
    // On Windows npx does not always resolve correct path, hence we manually resolve it here
    // https://github.com/flexn-io/renative/issues/1409#issuecomment-2095531486
    const reactNativeCmnd = `node  ${path.join(
        path.dirname(require.resolve('react-native')).replace(/ /g, '\\ '),
        'cli.js'
    )}`;
    // const reactNativeCmnd =  'npx react-native';

    let command = `${reactNativeCmnd} build-android --mode=${signingConfig} --tasks ${
        outputAab ? 'bundle' : 'assemble'
    }${signingConfig}`;

    if (extraGradleParams) {
        command += ` --extra-params ${extraGradleParams}`;
    }

    await executeAsync(command, {
        cwd: appFolder,
        env: {
            ...CoreEnvVars.BASE(),
            //NOTE: we need extensions here because rn will trigger packaging step in release mode
            ...CoreEnvVars.RNV_EXTENSIONS(),
            ...EnvVars.RNV_REACT_NATIVE_PATH(),
            ...EnvVars.RNV_APP_ID(),
            ...EnvVars.RNV_SKIP_LINKING()
        }
    });

    logSuccess(
        `Your APK is located in ${chalk.cyan(
            path.join(appFolder, `app/build/outputs/${outputAab ? 'bundle' : 'apk'}/${signingConfig.toLowerCase()}`)
        )} .`
    );
    return true;
};
