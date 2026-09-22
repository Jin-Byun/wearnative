import child_process from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
    chalk,
    ExecOptionsPresets,
    execCLI,
    executeAsync,
    executeTelnet,
    fsExistsSync,
    fsLstatSync,
    fsReadFileSync,
    inquirerPrompt,
    isSystemWin,
    logDebug,
    logDefault,
    logError,
    logRaw,
    logSuccess,
    logToSummary,
    logWarning,
    waitForExecCLI
} from '@rnv/core';
import { CLI_ANDROID_ADB, CLI_ANDROID_AVDMANAGER, CLI_ANDROID_EMULATOR, CLI_ANDROID_SDKMANAGER } from './constants';
import { getContext } from './getContext';
import type { AndroidDevice } from './types';

const execFileAsync = promisify(child_process.execFile);
const CHECK_INTEVAL = 5000;
const ERROR_MSG = {
    TARGET_EXISTS: 'Running multiple emulators with the same AVD',
    UNKNOWN_AVD: 'Unknown AVD name'
};
const IS_TABLET_ABOVE_INCH = 6.5;
type DeviceInfo = { key: string; name: string; value: string; icon: string };

const getDeviceIcon = (device: AndroidDevice) => {
    const { udid, avdConfig, isWear } = device;
    if (!isWear && udid === 'unknown' && !avdConfig) return '';
    return `${isWear ? 'Wear ⌚' : 'Phone 📱'} `;
};

const _getDeviceString = ({ name, udid, isDevice, isActive, arch }: AndroidDevice, deviceIcon: string) =>
    `${chalk.bold.white(name)} | ${deviceIcon} | arch: ${arch} | udid: ${chalk.grey(udid)}${
        isDevice ? chalk.red(' (device)') : ''
    } ${isActive ? chalk.magenta(' (active)') : ''}`;
//Fuck it, I just any this return until complete refactor
const _getDeviceAsString = (device: AndroidDevice, i: number): string => {
    const deviceIcon = getDeviceIcon(device);
    return ` [${i + 1}]> ${_getDeviceString(device, deviceIcon)}\n`;
};

const _getDeviceAsObject = (device: AndroidDevice): DeviceInfo => {
    const { name } = device;
    const deviceIcon = getDeviceIcon(device);
    return { key: name, name: _getDeviceString(device, deviceIcon), value: name, icon: deviceIcon };
};

const calculateDeviceDiagonal = (width: number, height: number, density: number) => {
    // Calculate the diagonal in inches
    const widthInches = width / density;
    const heightInches = height / density;
    return Math.hypot(widthInches, heightInches);
};

// cache data of devices in use
const currentDeviceProps: Record<string, Record<string, string>> = {};
const getRunningDeviceProp = async (udid: string, prop: string): Promise<string> => {
    // avoid multiple calls to the same device
    if (currentDeviceProps[udid]) return currentDeviceProps[udid][prop];

    const rawProps = await execCLI(CLI_ANDROID_ADB, `-s ${udid} shell getprop`);
    const lineRe = /\[.+\]: \[.*\n?[^[]*\]/gm;
    const wordRe = /^\[([^\]]+)\]:\s*\[([^\]]+)\]$/;
    const lines = (rawProps as string).match(lineRe) ?? [];
    if (!currentDeviceProps[udid]) currentDeviceProps[udid] = {};
    for (const line of lines) {
        const [, key, value] = line.match(wordRe) ?? [];
        currentDeviceProps[udid][key] = value;
    }

    return getRunningDeviceProp(udid, prop);
};

const decideIfWearRunning = async (device: AndroidDevice) => {
    const { udid, model, product } = device;
    const fingerprint = await getRunningDeviceProp(udid, 'ro.vendor.build.fingerprint');
    const name = await getRunningDeviceProp(udid, 'ro.product.vendor.name');
    const mod = await getRunningDeviceProp(udid, 'ro.product.vendor.model');
    const flavor = await getRunningDeviceProp(udid, 'ro.build.flavor');
    const description = await getRunningDeviceProp(udid, 'ro.build.description');

    const wearIndicators = ['wear', 'watch', 'rubyfish'];
    const dataArr = [fingerprint, name, mod, flavor, description, model, product];
    return wearIndicators.some((ind) => {
        return dataArr.some((v) => v?.toLowerCase()?.includes(ind));
    });
};

const getDeviceType = async (device: AndroidDevice) => {
    logDebug('getDeviceType - in', { device });
    if (device.udid === 'unknown' && !device.avdConfig) return device;
    device.isTV = false;
    const screenProps = {
        width: 0,
        height: 0,
        density: 0
    };
    if (device.udid !== 'unknown') {
        device.isWear = await decideIfWearRunning(device);
        device.arch = await getRunningDeviceProp(device.udid, 'ro.product.cpu.abi');

        const screenSizeResult = await execCLI(CLI_ANDROID_ADB, `-s ${device.udid} shell wm size`);
        const screenDensityResult = await execCLI(CLI_ANDROID_ADB, `-s ${device.udid} shell wm density`);
        if (screenSizeResult) {
            const [width, height] = (screenSizeResult as string)
                .split('Physical size: ')[1]
                .split('x')
                .map((v) => parseInt(v, 10) || 0);
            Object.assign(screenProps, { width, height });
        }
        if (screenDensityResult) {
            screenProps.density = parseInt((screenDensityResult as string).split('Physical density: ')[1], 10);
        }
    }
    if (device.avdConfig) {
        // Better detect wear
        const sysdir = device.avdConfig['image.sysdir.1'];
        const tagId = device.avdConfig['tag.id'];
        const tagDisplay = device.avdConfig['tag.display'];
        const deviceName = device.avdConfig['hw.device.name'];

        device.isWear = [sysdir, tagId, tagDisplay, deviceName].some((string) => string?.includes('wear'));
        device.arch = device.avdConfig['abi.type'];
        screenProps.density = parseInt(device.avdConfig['hw.lcd.density'], 10);
        screenProps.width = parseInt(device.avdConfig['hw.lcd.width'], 10);
        screenProps.height = parseInt(device.avdConfig['hw.lcd.height'], 10);
    }
    const { width, height, density } = screenProps;
    const diagonalInches = calculateDeviceDiagonal(width, height, density || 1);

    device.isTablet = diagonalInches > IS_TABLET_ABOVE_INCH && diagonalInches <= 15;
    device.isPhone = !device.isTablet && !device.isWear;
    device.isMobile = !device.isWear;
    logDebug('getDeviceType - out', { device });
    return device;
};

const getAvdConfigPaths = (): string[] => {
    const ctx = getContext();
    const { ANDROID_SDK_HOME, ANDROID_AVD_HOME } = process.env;
    return [ANDROID_AVD_HOME, `${ANDROID_SDK_HOME}/.android/avd`, `${ctx.paths.user.homeDir}/.android/avd`] as string[];
};

const getAvdDetails = (deviceName: string) => {
    const results: { avdConfig?: Record<string, string> } = {};
    const deviceIni = `${deviceName}.ini`;
    const avdConfigPaths = getAvdConfigPaths();
    for (const cPath of avdConfigPaths) {
        if (!fsExistsSync(cPath)) continue;
        const deviceIniPath = path.join(cPath, deviceIni);
        if (fsExistsSync(deviceIniPath) || fsLstatSync(deviceIniPath).isDirectory()) continue;
        const avdData = fsReadFileSync(deviceIniPath).toString();
        const line = avdData
            .trim()
            .split(/\r?\n/)
            .find((l) => l.startsWith('path=')) as string;
        const initData = fsReadFileSync(`${line.slice(5)}/config.ini`).toString();
        results.avdConfig = Object.fromEntries(
            initData
                .trim()
                .split(/\r?\n/)
                .map((initLine) => initLine.split('=').map((v) => v.trim()))
        );
        break;
    }
    return results;
};

const getEmulatorName = async (words: Array<string>) => {
    const [emulator] = words;
    const port = emulator.split('-')[1];

    const emulatorReply = await executeTelnet(port, 'avd name');
    const emulatorNameStr = emulatorReply.split('OK').at(-2);
    return emulatorNameStr?.trim?.() || '(err: could not parse emulator name)';
};

const _pairDevices = async (target: string) => {
    const { ip_address } = await inquirerPrompt({
        name: 'ip_address',
        type: 'input',
        message: `Please go to Settings, enable debugging, and enter the IP address and Port required for pairing:`
    });

    await execCLI(CLI_ANDROID_ADB, `pair ${ip_address}`, ExecOptionsPresets.INHERIT_OUTPUT_NO_SPINNER);
    await connectToWifiDevice(target);
};

const _parseDevicesResult = async (
    devicesString: string | undefined,
    avdsString: string | undefined,
    deviceOnly: boolean
) => {
    logDebug(`_parseDevicesResult:${devicesString}:${avdsString}:${deviceOnly}`);
    const c = getContext();
    const devices: Array<AndroidDevice> = [];
    const { skipTargetCheck } = c.program.opts();

    if (devicesString) {
        const lines = devicesString?.trim()?.split(/\r?\n/) ?? [];
        logDebug('_parseDevicesResult 2', { lines });
        const emulators: string[] = lines.filter((line) => {
            const words = line.split(/[ ,\t]+/).filter(Boolean);
            const [udid, deviceIndicator] = words;
            if (udid || deviceIndicator !== 'device') return false;
            logDebug('_parseDevicesResult 3', { words });
            const isDevice = !udid.includes('emulator');
            logDebug('_parseDevicesResult 4', {
                deviceOnly,
                isDevice
            });
            if (deviceOnly && !isDevice) return false;
            const product = _getDeviceProp(words, 'product:');
            if (!isDevice) {
                return true;
            }
            const name = _getDeviceProp(words, 'model:');
            logDebug('_parseDevicesResult 5-1', { name });
            devices.push({
                udid,
                isDevice,
                name,
                product,
                isActive: true,
                model: name
            });
            return false;
        });
        Promise.all(
            emulators.map(async (line) => {
                const words = line.split(/[ ,\t]+/).filter(Boolean);
                const [udid] = words;
                const product = _getDeviceProp(words, 'product:');
                await waitForEmulatorToBeReady(udid);
                const name = await getEmulatorName(words);
                logDebug('_parseDevicesResult 5-2', { name });
                devices.push({
                    udid,
                    name,
                    product,
                    isDevice: false,
                    isActive: true,
                    model: name
                });
            })
        );
    }

    if (avdsString && !deviceOnly) {
        const avdLines = avdsString.trim().split(/\r?\n/);
        logDebug('_parseDevicesResult 6', { avdLines });
        for (const line of avdLines) {
            const device: AndroidDevice = {
                udid: 'unknown',
                isDevice: false,
                isActive: false,
                name: line
            };
            try {
                Object.assign(device, getAvdDetails(line));
            } catch (e) {
                logError(e);
            }
            const { avdConfig: avdDetails } = device;
            const potentialDuplicate = devices.find((v) => v.name === device.name);
            // exclude duplicate sims (running ones + avdconfig)
            if (!avdDetails || potentialDuplicate?.isDevice !== true) continue;
            try {
                logDebug('_parseDevicesResult 7', { avdDetails });

                // Yes, 2 greps. Hacky but it excludes the grep process corectly and quickly :)
                // if this doesn't throw, than the emulator is running and needs to be excluded
                const findProcess = isSystemWin
                    ? `tasklist | find "avd ${line}"`
                    : `ps x | grep "avd ${line}" | grep -v grep`;
                child_process.execSync(findProcess);
                logDebug('_parseDevicesResult 8 - excluding running target');
                // continue;
            } catch (_e) {
                device.isRunning = true;
            }
            devices.push(device);
        }
    }

    logDebug('_parseDevicesResult 9', { devices });

    return Promise.all(devices.map((device) => getDeviceType(device))).then((devicesArray) =>
        devicesArray.filter((device) => {
            // filter devices based on selected platform
            const { platform } = c;
            if (skipTargetCheck) return true; // return everything if skipTargetCheck is used
            if (device.isNotEligibleAndroid) return false;
            if (platform === 'androidwear' && device.isWear) {
                logDebug('getDeviceType - filter', {
                    device,
                    matches: true,
                    platform
                });
                return true;
            }
            return false;
        })
    );
};

const _getDeviceProp = (arr: Array<string>, prop: string) => arr.find((v) => v.includes(prop))?.replace(prop, '') ?? '';

const _createEmulator = async (
    apiVersion: string,
    emuPlatform: string,
    emuName: string,
    arch = 'x86',
    device: string
) => {
    logDefault('_createEmulator');
    const targetEmulator = `"system-images;android-${apiVersion};${emuPlatform};${arch}"`;
    try {
        await execCLI(CLI_ANDROID_SDKMANAGER, targetEmulator);
        await execCLI(
            CLI_ANDROID_AVDMANAGER,
            `create avd -n ${emuName} -k ${targetEmulator} --device "${device}"`,
            ExecOptionsPresets.INHERIT_OUTPUT_NO_SPINNER
        );
    } catch (e) {
        logError(e);
    }
};

const waitForEmulatorToBeReady = async (emulator: string) =>
    await waitForExecCLI(CLI_ANDROID_ADB, `-s ${emulator} shell getprop init.svc.bootanim`, (res) => {
        if (typeof res === 'string') {
            return res.includes('stopped');
        }
        return res;
    });

const composeDevicesString = (devices: Array<AndroidDevice>) => {
    logDefault('composeDevicesString', `numDevices:${devices ? devices.length : null}`);
    return `\n${devices.map(_getDeviceAsString).join('')}`;
};

export const composeDevicesArray = (devices: Array<AndroidDevice>) => {
    logDefault('composeDevicesString', `numDevices:${devices ? devices.length : null}`);
    return devices.map(_getDeviceAsObject);
};

export const launchAndroidSimulator = async (
    target: true | { name: string } | string,
    isIndependentThread = false
): Promise<boolean> => {
    const c = getContext();
    logDefault(
        'launchAndroidSimulator',
        `target:${typeof target === 'object' ? target.name : target} independentThread:${!!isIndependentThread}`
    );
    let newTarget: { name: string } | string;
    if (target === true) {
        const { device } = c.program.opts();
        const list = await getAndroidTargets(false, device, device);
        const choices = composeDevicesArray(list);
        const response = await inquirerPrompt({
            name: 'chosenTarget',
            type: 'list',
            message: 'What target would you like to launch?',
            choices
        });
        newTarget = response.chosenTarget;
    } else {
        newTarget = target;
    }
    if (!newTarget) return Promise.reject('No simulator -t target name specified!');

    const actualTarget = typeof newTarget === 'string' ? newTarget : newTarget.name;
    const cliCommand = `${c.cli[CLI_ANDROID_EMULATOR]} -avd ${actualTarget}`;
    const execOption = isIndependentThread
        ? ExecOptionsPresets.FIRE_AND_FORGET
        : ExecOptionsPresets.SPINNER_FULL_ERROR_SUMMARY;
    try {
        await executeAsync(cliCommand, execOption);
    } catch (err) {
        if (typeof err !== 'string') {
            if (!isIndependentThread) return Promise.reject(err);
            logError(err);
            return true;
        }
        if (isIndependentThread && err.includes('WHPX')) {
            logWarning(err);
            logError(
                'It seems you do not have the Windows Hypervisor Platform virtualization enabled. Enter windows features in the Windows search box and select Turn Windows features on or off in the search results. In the Windows Features dialog, enable both Hyper-V and Windows Hypervisor Platform.'
            );
            return false;
        }
        const prefix = `Target with name ${chalk.red(actualTarget)}`;
        if (err.includes(ERROR_MSG.UNKNOWN_AVD)) {
            logWarning(`${prefix} does not exist. You can update it here: ${chalk.cyan(c.paths.dotRnv.config)}`);
            await launchAndroidSimulator(true, false);
        } else if (err.includes(ERROR_MSG.TARGET_EXISTS)) {
            logToSummary(`${prefix} already running. SKIPPING.`);
        }
    }
    return true;
};

export const listAndroidTargets = async () => {
    const c = getContext();
    logDefault('listAndroidTargets');
    const { device } = c.program.opts();

    await resetAdb();
    const list = await getAndroidTargets(false, device, device);
    const devices = composeDevicesString(list);
    logToSummary(`Android Targets:\n${devices}`);
    if (devices.trim() === '') {
        logToSummary('Android Targets: No devices found');
    }
    return devices;
};

export const resetAdb = async (forceRun?: boolean, ranBefore?: boolean) => {
    const c = getContext();
    if (!c.program.opts().resetAdb && !forceRun) return;
    if (!ranBefore) {
        try {
            await execCLI(CLI_ANDROID_ADB, 'kill-server');
        } catch (e) {
            logWarning(e);
        }
    }
    try {
        await execCLI(CLI_ANDROID_ADB, 'start-server');
    } catch (e) {
        if (ranBefore) {
            return Promise.reject(e);
        }
        logWarning(`Got error:\n${e}\nWill attemnt again in 5 seconds`);
        setTimeout(resetAdb, 5000, true, true);
    }
};

export const getAndroidTargets = async (skipDevices: boolean, skipAvds: boolean, deviceOnly = false) => {
    logDefault('getAndroidTargets', `skipDevices:${skipDevices} skipAvds:${skipAvds} deviceOnly:${deviceOnly}`);
    try {
        let devicesResult: string | undefined;
        let avdResult: string | undefined;

        if (!skipDevices) {
            devicesResult = (await execCLI(CLI_ANDROID_ADB, 'devices -l')) as string;
        }
        if (!skipAvds) {
            avdResult = (await execCLI(CLI_ANDROID_EMULATOR, '-list-avds')) as string;
        }
        return _parseDevicesResult(devicesResult, avdResult, deviceOnly);
    } catch (e) {
        return Promise.reject(e);
    }
};

export const connectToWifiDevice = async (target: string) => {
    const connect_str = `connect ${target}${target.includes(':') ? '' : ':5555'}`;
    const deviceResponse = (await execCLI(CLI_ANDROID_ADB, connect_str)) as string;
    if (deviceResponse.includes('connected to')) return true;

    try {
        const { stderr } = await execFileAsync(
            'ping',
            isSystemWin ? [target.split(':')[0]] : ['-c', '1', target.split(':')[0]]
        );
        if (stderr) throw new Error();
        logWarning(
            `You'll need to pair your device before installing app. \nFor more information: https://developer.android.com/studio/run/device`
        );
        return await _pairDevices(target);
    } catch (_error) {
        logError(`Failed to ${connect_str}. Connection refused. Make sure to that ip and port are correct.`);
        return false;
    }
};

export const askForNewEmulator = async () => {
    const c = getContext();
    const { platform } = c;
    if (!platform) return;
    logDefault('askForNewEmulator');

    let emuName = c.files.workspace.config?.defaultTargets?.[platform];
    const { confirm } = await inquirerPrompt({
        name: 'confirm',
        type: 'confirm',
        message: `Do you want ReNative to create new Emulator (${chalk.bold.white(
            emuName
        )}) for you? Warning: created simulator can malfunction.`
    });

    if (!confirm) {
        const { openStudio } = await inquirerPrompt({
            name: 'openStudio',
            type: 'confirm',
            message: `Would you like to create simulator manually? (It will open Android Studio.)`
        });
        if (openStudio) {
            try {
                return executeAsync('open -a /Applications/Android\\ Studio.app');
            } catch (error) {
                logError(`Couldn't open Android Studio. Please check if it installed correctly.Error: ${error}`);
            }
        }
    }
    if (!emuName) {
        const { newEmuName } = await inquirerPrompt({
            name: 'confirm',
            type: 'input',
            message: `Type name of the emulator to launch`
        });
        emuName = newEmuName;
    }

    const sdk = '34';
    const arch = os.arch() === 'arm64' ? 'arm64-v8a' : 'x86';

    if (confirm && emuName !== undefined) {
        const emuLaunch = {
            name: emuName
        };
        switch (platform) {
            case 'android':
                return _createEmulator(sdk, 'google_apis', emuName, arch, 'pixel_3a').then(() =>
                    launchAndroidSimulator(emuLaunch, true)
                );
            case 'androidwear':
                return _createEmulator(sdk, 'android-wear', emuName, arch, 'wearos_small_round').then(() =>
                    launchAndroidSimulator(emuLaunch, true)
                );
            default:
                return Promise.reject('Cannot find any active or created emulators');
        }
    }
    return Promise.reject('Action canceled!');
};

export const checkForActiveEmulator = (emulatorName?: string) =>
    new Promise<AndroidDevice | undefined>((resolve, reject) => {
        const c = getContext();
        const { platform } = c;
        if (!platform) {
            return resolve(undefined);
        }
        logDefault('checkForActiveEmulator');

        let attempts = 1;
        const maxAttempts = isSystemWin ? 25 : 10;
        let running = false;
        const poll = setInterval(async () => {
            // Prevent the interval from running until enough promises return to make it stop or we get a result
            if (!running) {
                running = true;
                try {
                    const devices = await getAndroidTargets(false, true, false);
                    const emulators = devices.filter((device) => !device.isDevice);
                    logDebug('Available devices after filtering', emulators);
                    const found = (emulatorName && emulators.find((v) => v.name === emulatorName)) || emulators[0];
                    if (found) {
                        logSuccess(`Found active emulator! ${chalk.bold.white(found.udid)}. Will use it`);
                        clearInterval(poll);
                        return resolve(found);
                    }
                    logRaw(`looking for active emulators: attempt ${attempts++}/${maxAttempts}`);
                    if (platform === 'androidwear' && attempts === 2) {
                        await resetAdb(true); // from time to time adb reports a recently started atv emu as being offline. Restarting adb fixes it
                    }
                    if (attempts > maxAttempts) {
                        clearInterval(poll);
                        reject('Could not find any active emulators');
                    }
                    running = false;
                } catch (e) {
                    clearInterval(poll);
                    logError(e);
                }
            }
        }, CHECK_INTEVAL);
    });
