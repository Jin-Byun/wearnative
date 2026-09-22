import path from 'node:path';
import {
    type ConfigFileWorkspace,
    chalk,
    fsExistsSync,
    fsLstatSync,
    fsReaddirSync,
    generateBuildConfig,
    getContext,
    getRealPath,
    inquirerPrompt,
    isSystemWin,
    logDefault,
    logError,
    logInfo,
    logSuccess,
    logWarning,
    type RnvContext,
    writeFileSync
} from '@rnv/core';

import { CLI_ANDROID_ADB, CLI_ANDROID_AVDMANAGER, CLI_ANDROID_EMULATOR, CLI_ANDROID_SDKMANAGER } from './constants';

type SDKKey = keyof Required<ConfigFileWorkspace>['sdks'];

const getSdkLocations = () => {
    const ctx = getContext();
    const { homeDir } = ctx.paths.user;
    const android = [
        path.join('/usr/local/android-sdk'),
        path.join(homeDir, 'Library/Android/sdk'),
        path.join(homeDir, 'AppData/Local/Android/android-sdk'),
        path.join(homeDir, 'AppData/Local/Android/sdk'),
        path.join('Program Files (x86)/Android/android-sdk')
    ];
    const SDK_LOCATIONS: Record<string, Array<string>> = {
        android,
        'android-ndk': android.flatMap((v) => [path.join(v, 'ndk'), path.join(v, 'ndk-bundle')])
    };
    return SDK_LOCATIONS;
};

const _logSdkWarning = (c: RnvContext) =>
    logWarning(`Your ${c.paths.workspace.config} is missing SDK configuration object`);
const _getCurrentSdkPath = (c: RnvContext) => (c.platform ? c.buildConfig?.sdks?.ANDROID_SDK : undefined);
const _isSdkInstalled = (c: RnvContext) => {
    logDefault('_isSdkInstalled');
    return !!c.platform && fsExistsSync(getRealPath(_getCurrentSdkPath(c)));
};
const _findFolderWithFile = (dir: string, fileToFind: string): string | undefined => {
    const opt = path.join(dir, fileToFind);
    if (fsExistsSync(opt)) return dir;
    for (const subDirName of fsReaddirSync(dir)) {
        // not a directory check
        const subDir = path.join(dir, subDirName);
        if (!fsLstatSync(subDir).isDirectory()) return;
        const foundSubDir = _findFolderWithFile(subDir, fileToFind);
        if (foundSubDir) return foundSubDir;
    }
};
const _attemptAutoFix = async (c: RnvContext, sdkPlatform: string, sdkKey: SDKKey, traverseUntilFoundFile?: string) => {
    logDefault('_attemptAutoFix');

    if (c.program.opts().hosted) {
        logInfo('HOSTED Mode. Skipping SDK checks');
        return true;
    }

    const locations: Array<string | undefined> = getSdkLocations()[sdkPlatform];
    // try common Android SDK env variables
    if (sdkKey === 'ANDROID_SDK') {
        const { ANDROID_SDK_HOME, ANDROID_SDK_ROOT, ANDROID_HOME, ANDROID_SDK } = process.env;
        locations.push(ANDROID_SDK_HOME, ANDROID_SDK_ROOT, ANDROID_HOME, ANDROID_SDK);
    }
    if (sdkKey === 'ANDROID_NDK') {
        const { ANDROID_NDK_HOME } = process.env;
        locations.push(ANDROID_NDK_HOME);
    }

    let result = locations.find((v) => fsExistsSync(v));
    if (result && traverseUntilFoundFile) {
        const subResult = _findFolderWithFile(result, traverseUntilFoundFile);
        if (subResult) {
            result = subResult;
        }
    }

    if (result) {
        logSuccess(`Found existing ${chalk.bold.white(sdkKey)} location at ${chalk.bold.white(result)}`);
        let confirmSdk = true;
        if (!c.program.opts().ci) {
            const { confirm } = await inquirerPrompt({
                type: 'confirm',
                name: 'confirm',
                message: 'Do you want to use it?'
            });
            confirmSdk = confirm;
        }
        if (confirmSdk && c.files.workspace.config) {
            try {
                if (!c.files.workspace.config?.sdks) c.files.workspace.config.sdks = {};
                c.files.workspace.config.sdks[sdkKey] = result;
                writeFileSync(c.paths.workspace.config, c.files.workspace.config);
                generateBuildConfig();
                await checkAndConfigureAndroidSdks();
            } catch (e) {
                logError(e);
            }
            return true;
        }
    }
    logDefault(`_attemptAutoFix: no sdks found. searched at: ${getSdkLocations()[sdkPlatform].join(', ')}`);
    generateBuildConfig();
    return true;
};

export const checkAndConfigureAndroidSdks = async () => {
    const c = getContext();
    const sdk = c.buildConfig?.sdks?.ANDROID_SDK;
    logDefault('checkAndConfigureAndroidSdks', `(${sdk})`);

    if (!sdk) return _logSdkWarning(c);
    const managerExt = isSystemWin ? '.bat' : '';
    const emulatorExt = isSystemWin ? '.exe' : '';

    let sdkManagerPath = getRealPath(path.join(sdk, `cmdline-tools/latest/bin/sdkmanager${managerExt}`));
    if (!fsExistsSync(sdkManagerPath)) {
        sdkManagerPath = getRealPath(path.join(sdk, `tools/bin/sdkmanager${managerExt}`));
    }

    let avdManagerPath = getRealPath(path.join(sdk, `cmdline-tools/latest/bin/avdmanager${managerExt}`));
    if (!fsExistsSync(avdManagerPath)) {
        avdManagerPath = getRealPath(path.join(sdk, `tools/bin/avdmanager${managerExt}`));
    }
    Object.assign(c.cli, {
        [CLI_ANDROID_EMULATOR]: getRealPath(path.join(sdk, `emulator/emulator${emulatorExt}`)),
        [CLI_ANDROID_ADB]: getRealPath(path.join(sdk, `platform-tools/adb${emulatorExt}`)),
        [CLI_ANDROID_AVDMANAGER]: avdManagerPath,
        [CLI_ANDROID_SDKMANAGER]: sdkManagerPath
    });
};
export const checkAndroidSdk = async () => {
    const c = getContext();
    logDefault('checkAndroidSdk');

    if (!_isSdkInstalled(c)) {
        logWarning(
            `${c.platform} platform requires Android SDK to be installed. Your SDK path in ${chalk.bold.white(
                c.paths.workspace.config
            )} does not exist: ${chalk.bold.white(_getCurrentSdkPath(c))}`
        );

        await _attemptAutoFix(c, 'android', 'ANDROID_SDK');
        return await _attemptAutoFix(c, 'android-ndk', 'ANDROID_NDK', 'source.properties');
    }
    await checkAndConfigureAndroidSdks();
    return true;
};
