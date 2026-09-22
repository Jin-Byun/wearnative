import net from 'node:net';
import path from 'node:path';
import {
    chalk,
    copyAssetsFolder,
    copyBuildsFolder,
    copyFileSync,
    execaCommand,
    execCLI,
    executeAsync,
    fsExistsSync,
    fsWriteFileSync,
    getAppFolder,
    getConfigProp,
    getRealPath,
    inquirerPrompt,
    isPlatformActive,
    isSystemWin,
    logDebug,
    logDefault,
    logError,
    logInfo,
    logRaw,
    logSuccess,
    logWarning,
    mkdirSync,
    parseFonts,
    parsePlugins,
    type RnvPlatform,
    type RnvPlatformKey,
    updateObjectSync,
    updateRenativeConfigs
} from '@rnv/core';
import { generateEnvVarsFile, packageReactNativeAndroid, runReactNativeAndroid } from '@rnv/sdk-react-native';
import { getEntryFile, updateDefaultTargets } from '@rnv/sdk-utils';
import { ANDROID_COLORS, ANDROID_STRINGS, ANDROID_STYLES, CLI_ANDROID_ADB } from './constants';
import {
    askForNewEmulator,
    checkForActiveEmulator,
    composeDevicesArray,
    connectToWifiDevice,
    getAndroidTargets,
    launchAndroidSimulator,
    resetAdb
} from './deviceManager';
import { ejectGradleProject } from './ejector';
import { type Context, getContext } from './getContext';
import {
    injectPluginGradleSync,
    parseAndroidConfigObject,
    parseAppBuildGradleSync,
    parseBuildGradleSync,
    parseGradlePropertiesSync,
    parseSettingsGradleSync
} from './gradleParser';
import { parseGradleWrapperSync } from './gradleWrapperParser';
import {
    injectPluginKotlinSync,
    parseMainActivitySync,
    parseMainApplicationSync,
    parseSplashActivitySync
} from './kotlinParser';
import { parseAndroidManifestSync } from './manifestParser';
import type { AndroidDevice } from './types';
import { getConfigPropArray } from './utils';
import { parseValuesXml } from './xmlValuesParser';

export const packageAndroid = async () => {
    logDefault('packageAndroid');
    return packageReactNativeAndroid();
};

export const getAndroidDeviceToRunOn = async () => {
    const c = getContext();
    const defaultTarget = c.runtime.target;
    logDefault('getAndroidDeviceToRunOn', `default:${defaultTarget}`);
    if (!c.platform) return;

    const { target, device } = c.program.opts();

    await resetAdb();
    const targetToConnectWiFi = _isString(target) ? target : device;

    if (_isString(targetToConnectWiFi) && net.isIP(targetToConnectWiFi.split(':')[0])) {
        await connectToWifiDevice(targetToConnectWiFi);
    }

    const devicesAndEmulators = await getAndroidTargets(false, false, !!device);
    const activeDevices = devicesAndEmulators.filter((d) => d.isActive);
    const foundDevice = devicesAndEmulators.find(({ udid, name }) =>
        [target, device].some((s) => udid.includes(s) || name.includes(s))
    );
    const askWhereToRun = async () => {
        if (!devicesAndEmulators.length) {
            if (device) {
                return Promise.reject('No active devices found, please connect one or remove the device argument');
            }
            await askForNewEmulator();
            return await checkForActiveEmulator();
        }
        // No device active and device param is passed, exiting
        if (device && !activeDevices.length) {
            return Promise.reject('No active devices found, please connect one or remove the device argument');
        }
        if (!foundDevice && (_isString(target) || _isString(device))) {
            logInfo(
                `The target is specified, but no such emulator or device is available: ${chalk.magenta(
                    _isString(target) ? target : device
                )}. Will try to find available one`
            );
        }
        const choices = composeDevicesArray(devicesAndEmulators);

        const { chosenTarget } = await inquirerPrompt({
            name: 'chosenTarget',
            type: 'list',
            message: 'What target would you like to use?',
            choices
        });
        if (chosenTarget) {
            // update defaultTarget
            if (!target) {
                await updateDefaultTargets(c, chosenTarget);
            }
            const chosenDevice = activeDevices.find((d) => d.name === chosenTarget);
            if (chosenDevice) return chosenDevice;

            await launchAndroidSimulator(chosenTarget, true);
            return await checkForActiveEmulator(chosenTarget);
        }
    };
    if (target) {
        // a target is provided
        logDebug('Target provided', target);
        if (foundDevice) {
            if (foundDevice.isActive) {
                return foundDevice;
            }
            await launchAndroidSimulator(foundDevice, true);
            return await checkForActiveEmulator(foundDevice.name);
        }
    } else if (activeDevices.length === 1 && device) {
        logDebug('Device provided', device);
        if (!_isString(device)) {
            const [availableDevice] = activeDevices;
            logInfo(`Found device ${availableDevice.name}:${availableDevice.udid}`);
            return availableDevice;
        }
        if (foundDevice?.isActive) return foundDevice;
    } else if (defaultTarget) {
        // neither a target nor an active device is found, revert to default target if available
        logDebug('Default target used', defaultTarget);
        const foundDevice = devicesAndEmulators.find(({ udid, name }) =>
            [udid, name].some((v) => v.includes(defaultTarget))
        );
        if (foundDevice) {
            if (foundDevice.isActive) return foundDevice;
            await launchAndroidSimulator(foundDevice, true);
            const device = await checkForActiveEmulator(foundDevice.name);
            return device;
        }
    }
    // we don't know what to do, ask the user
    logDebug('Target not provided, asking where to run');
    return askWhereToRun();
};

export const runAndroid = async (device: AndroidDevice) => {
    logDefault('runAndroid', `target:${device.udid}`);
    const c = getContext();
    const { uninstall } = c.program.opts();
    if (uninstall) {
        const packageId = getConfigProp('id');
        if (packageId) {
            try {
                await execCLI(CLI_ANDROID_ADB, `uninstall ${packageId}`, { silent: true });
            } catch (_e) {
                return Promise.reject(`Failed to uninstall ${packageId}`);
            }
        }
    }
    await runReactNativeAndroid(device);
};

const _checkSigningCerts = async (c: Context) => {
    logDefault('_checkSigningCerts');
    const signingConfig = getConfigProp('signingConfig') || 'Debug';
    const { appConfig: filesAC } = c.files.workspace;
    if (
        !c.platform ||
        !filesAC.configPrivate ||
        signingConfig !== 'Release' ||
        c.payload.pluginConfigAndroid?.store?.storeFile
    ) {
        return;
    }
    const { appConfig: pathsAC } = c.paths.workspace;
    const { dir } = pathsAC;

    const msg = `You're attempting to ${
        c.command
    } app in release mode but you have't configured your ${chalk.bold.white(
        pathsAC.configPrivate
    )} for ${chalk.bold.white(c.platform)} platform yet.`;

    if (c.program.opts().ci === true) return Promise.reject(msg);

    logWarning(msg);
    const { confirm } = await inquirerPrompt({
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to configure it now?'
    });

    if (!confirm) return Promise.reject("You selected no. Can't proceed");

    let confirmCopy = false;
    let platCandidate: RnvPlatform = null;
    const { confirmNewKeystore } = await inquirerPrompt({
        type: 'confirm',
        name: 'confirmNewKeystore',
        message: 'Do you want to generate new keystore as well?'
    });

    const platforms = filesAC.configPrivate?.platforms || {};

    if (filesAC.configPrivate) {
        const platCandidates: RnvPlatformKey[] = ['androidwear', 'android'];
        for (const p of platCandidates) {
            if (!platforms[p]) continue;
            platCandidate = p;
            const resultCopy = await inquirerPrompt({
                type: 'confirm',
                name: 'confirmCopy',
                message: `Found existing keystore configuration for ${platCandidate}. do you want to reuse it?`
            });
            confirmCopy = resultCopy?.confirmCopy;
        }
    }

    if (confirmCopy && platCandidate) {
        platforms[c.platform] = platforms[platCandidate];
    } else if (confirmNewKeystore || dir) {
        let storeFile: string | undefined;

        if (!confirmNewKeystore) {
            const result = await inquirerPrompt({
                type: 'input',
                name: 'storeFile',
                default: './release.keystore',
                message: `Paste relative path to ${chalk.bold.white(
                    c.paths.workspace.appConfig.dir
                )} of your existing ${chalk.bold.white('release.keystore')} file`
            });
            storeFile = result?.storeFile;
        }
        const { storePassword } = await inquirerPrompt({
            type: 'password',
            name: 'storePassword',
            message: 'storePassword'
        });
        const { keyAlias } = await inquirerPrompt({
            type: 'input',
            name: 'keyAlias',
            message: 'keyAlias'
        });
        const { keyPassword } = await inquirerPrompt({
            type: 'password',
            name: 'keyPassword',
            message: 'keyPassword'
        });
        mkdirSync(dir);
        if (confirmNewKeystore) {
            const keystorePath = path.join(dir, 'release.keystore');
            const keytoolCmd = `keytool -genkey -v -keystore ${keystorePath} -alias ${keyAlias} -keypass ${keyPassword} -storepass ${storePassword} -keyalg RSA -keysize 2048 -validity 10000`;
            await executeAsync(keytoolCmd, {
                shell: true,
                stdio: 'inherit',
                silent: true
            });
            storeFile = './release.keystore';
        }
        filesAC.configPrivate = {
            platforms: {}
        };
        if (storeFile) {
            platforms[c.platform] = {
                storeFile,
                storePassword,
                keyAlias,
                keyPassword
            };
        }
    }

    updateObjectSync(pathsAC.configPrivate, filesAC.configPrivate);
    logSuccess(`Successfully updated private config file at ${chalk.bold.white(dir)}.`);
    await updateRenativeConfigs();
    parseAppBuildGradleSync();
};

export const configureAndroidProperties = () => {
    logDefault('configureAndroidProperties');

    const c = getContext();
    const appFolder = getAppFolder();

    c.runtime.platformBuildsProjectPath = appFolder;
    const { ANDROID_NDK, ANDROID_SDK } = c.buildConfig?.sdks ?? {};
    const addNDK = ANDROID_NDK && !ANDROID_NDK.includes('<USER>');
    let ndkString = (addNDK && `ndk.dir=${getRealPath(ANDROID_NDK)}`) || '';
    let sdkDir = getRealPath(ANDROID_SDK);

    if (!sdkDir) {
        logError(`Cannot resolve c.buildConfig.sdks.ANDROID_SDK: ${ANDROID_SDK}`);
        return false;
    }
    if (isSystemWin) {
        sdkDir = sdkDir.replace(/\\/g, '/');
        ndkString = ndkString.replace(/\\/g, '/');
    }

    fsWriteFileSync(
        path.join(appFolder, 'local.properties'),
        `#Generated by ReNative (https://renative.org)\n${ndkString}\nsdk.dir=${sdkDir}`
    );
    return true;
};

export const configureGradleProject = async () => {
    logDefault('configureGradleProject');
    if (!isPlatformActive()) return;

    copyAssetsFolder('app/src/main');
    configureAndroidProperties();
    await configureProject();
    await copyBuildsFolder();
    await generateEnvVarsFile();
    return true;
};

export const configureProject = async () => {
    logDefault('configureProject');
    const c = getContext();

    const appFolder = getAppFolder();
    const outputFile = getEntryFile();

    mkdirSync(path.join(appFolder, 'app/src/main/assets'));
    fsWriteFileSync(path.join(appFolder, `app/src/main/assets/${outputFile}.bundle`), '{}');

    // PLUGINS
    parsePlugins((plugin, pluginPlat, key) => {
        injectPluginGradleSync(plugin, pluginPlat, key);
        injectPluginKotlinSync(pluginPlat);
    });

    c.payload.pluginConfigAndroid.pluginPackages = c.payload.pluginConfigAndroid.pluginPackages.slice(
        0,
        c.payload.pluginConfigAndroid.pluginPackages.length - 2
    );

    // FONTS
    const includedFonts = getConfigProp('includedFonts') || [];
    const fontExt = ['.ttf', '.otf'];
    parseFonts((font: string, dir: string) => {
        if (!font || !includedFonts) return;
        if (!fontExt.some((ext) => font.includes(ext))) return;
        const [key] = font.split('.');
        if (includedFonts.includes('*') || includedFonts.includes(key)) {
            const fontSource = path.join(dir, font);
            if (!fsExistsSync(fontSource)) {
                logWarning(`Font ${chalk.bold.white(fontSource)} doesn't exist! Skipping.`);
                return;
            }
            const fontFolder = path.join(appFolder, 'app/src/main/assets/fonts');
            mkdirSync(fontFolder);
            const fontNormalised = font.replaceAll('__', ' ');
            const fontDest = path.join(fontFolder, fontNormalised);
            copyFileSync(fontSource, fontDest);
        }
    });
    parseAndroidConfigObject();
    parseSettingsGradleSync();
    parseAppBuildGradleSync();
    parseBuildGradleSync();
    parseGradleWrapperSync();
    parseMainActivitySync();
    parseMainApplicationSync();
    parseSplashActivitySync();

    const androidTemplateArray = getConfigPropArray(c, 'templateAndroid');
    parseValuesXml(androidTemplateArray, ANDROID_STRINGS, true);
    parseValuesXml(androidTemplateArray, ANDROID_STYLES);
    parseValuesXml(androidTemplateArray, ANDROID_COLORS, true);
    parseAndroidManifestSync(androidTemplateArray);
    parseGradlePropertiesSync();
    await _checkSigningCerts(c);

    return true;
};

// Resolve or reject will not be called so this will keep running
export const runAndroidLog = async () => {
    const c = getContext();
    logDefault('runAndroidLog');
    const filter = c.program.opts().filter || '';
    const child = execaCommand(`${c.cli[CLI_ANDROID_ADB]} logcat`);
    // use event hooks to provide a callback to execute when data are available:
    child.stdout?.on('data', (data: Buffer) => {
        data.toString()
            .split('\n')
            .filter((line) => line.includes(filter))
            .forEach((line) => {
                switch (true) {
                    case line.includes(' E '):
                        logRaw(chalk.red(line));
                        break;
                    case line.includes(' W '):
                        logRaw(chalk.yellow(line));
                        break;
                    default:
                        logRaw(line);
                }
            });
    });
    return child.then((res) => res.stdout).catch((err) => Promise.reject(`Error: ${err}`));
};

const _isString = (target: boolean | string | undefined): target is string => typeof target === 'string';

export { ejectGradleProject };
