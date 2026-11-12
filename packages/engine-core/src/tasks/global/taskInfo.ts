import { createTask, execCLI, getContext, logDebug, logError, logToSummary, RnvTaskName } from '@rnv/core';
import envinfo from 'envinfo';
import semver from 'semver';

export default createTask({
    description: 'Get relevant version info about OS, toolchain and libraries',
    fn: async () => {
        const parsedInfo = await _getEnvironmentInfo();
        if (!parsedInfo) throw new Error("can't get environmentInfo");
        await _checkAndConfigureSdks();
        await _getCliVersions(parsedInfo);
        logToSummary(_formatObject(parsedInfo));
        return true;
    },
    task: RnvTaskName.info,
    isGlobalScope: true
});

const _checkAndConfigureSdks = async () => {
    const moduleConfigs = [
        { moduleName: 'sdk-tizen', configureFunction: 'checkAndConfigureTizenSdks' },
        { moduleName: 'sdk-webos', configureFunction: 'checkAndConfigureWebosSdks' }
    ];
    for (const config of moduleConfigs) {
        const { moduleName, configureFunction } = config;
        await _checkAndConfigureTargetSdk(moduleName, configureFunction);
    }
};

const _checkAndConfigureTargetSdk = async (moduleName: string, configureFunction: string): Promise<void> => {
    try {
        const SDKModule = require(`@rnv/${moduleName}`);
        await SDKModule[configureFunction]();
    } catch (e) {
        logDebug(`Error configuring ${moduleName} SDK: `, e);
    }
};

const _getCliVersions = async (parsedInfo: Record<string, any>) => {
    const c = getContext();
    const cliVersions: { [key: string]: { version: string; path: string } } = {};

    const addCliVersion = async (cli: string, command: string, path: string, cliName: string) => {
        try {
            const cliVersionOutput = await execCLI(cli, command);
            const cliVersionNumber = semver.coerce(cliVersionOutput as any)?.version;
            if (cliVersionNumber) {
                cliVersions[`${cliName.replace('-', ' ').toUpperCase()}`] = { version: cliVersionNumber, path };
            }
        } catch (e) {
            logDebug(`Error getting version for ${cliName}: `, e);
        }
    };

    if (c.cli.webosAres) {
        await addCliVersion('webosAres', '--version', c.cli.webosAres, 'WEBOS CLI');
    }
    if (c.cli.tizen) {
        await addCliVersion('tizen', 'version', c.cli.tizen, 'TIZEN CLI');
    }
    if (Object.keys(cliVersions).length) {
        parsedInfo.CLI = cliVersions;
    }
};
const _formatObject = (obj: Record<string, any>, indent = 0) => {
    let formattedString = '';
    if (indent === 0) formattedString += '\n';
    for (const [key, value] of Object.entries(obj)) {
        formattedString += ' '.repeat(indent);
        if (typeof value === 'object') {
            switch (true) {
                case !!obj[key].version:
                    formattedString += `${key}: ${obj[key].version} ${obj[key].path ? `- ${obj[key].path}` : ''}\n`;
                    break;
                case Array.isArray(value):
                    formattedString += `${key}: ${obj[key].join(', ')}\n`;
                    break;
                default:
                    formattedString += `${key}:\n${_formatObject(obj[key], indent + 2)}`;
            }
        } else {
            formattedString += `${key}: ${obj[key]}\n`;
        }
    }
    return formattedString;
};

const _getEnvironmentInfo = async () => {
    try {
        const output = await envinfo.run(
            {
                System: ['OS', 'CPU', 'Memory', 'Shell'],
                Binaries: ['Node', 'Yarn', 'npm', 'Watchman'],
                Managers: ['CocoaPods'],
                Languages: ['Ruby', 'Java'],
                IDEs: ['Xcode', 'Android Studio'],
                SDKs: ['iOS SDK', 'Android SDK'],
                npmPackages: ['react', 'react-native', '@react-native-community/cli', 'rnv'],
                npmGlobalPackages: ['*react-native*', 'rnv', 'lerna']
            },
            { json: true, duplicates: false }
        );
        return JSON.parse(output) as Record<string, any>;
    } catch (e) {
        logError(e);
    }
};
