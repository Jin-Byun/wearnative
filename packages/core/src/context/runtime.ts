import path from 'node:path';
import { logDebug, logDefault } from '../logger';
import { fsExistsSync, fsReadFileSync } from '../system/fs';
import { generateRuntimePropInjects } from '../system/injectors';
import { isSystemWin } from '../system/is';
import { getConfigProp } from './contextProps';
import { getContext } from './provider';
import type { RnvContext } from './types';

export const configureRuntimeDefaults = () => {
    const c = getContext();
    const { platform, runtime } = c;
    const { port: portOpt, target, scheme, hostIp, hosted } = c.program.opts();
    runtime.appId = c.files.project?.configLocal?._meta?.currentAppConfigId || _getAppId(c);
    if (runtime.appId) {
        runtime.appConfigDir = path.join(c.paths.project.appConfigsDir, runtime.appId);
    }
    logDefault('configureRuntimeDefaults', `appId:${c.runtime.appId}`);

    let port: number | undefined;
    let defaultTarget: string | undefined;
    if (platform) {
        runtime.currentEngine = runtime.enginesByPlatform?.[platform];
        runtime.currentPlatform = runtime.currentEngine?.platforms?.[platform];

        port = c.buildConfig?.defaults?.ports?.[platform];
        defaultTarget = c.buildConfig?.defaultTargets?.[platform];
    }

    const portStart = Number(portOpt) || port || runtime.currentPlatform?.defaultPort;
    const portOffset = c.buildConfig?.defaults?.portOffset || 0;
    runtime.port = (portStart as number) + portOffset; // possibly NaN

    const defaultHost = isSystemWin ? '127.0.0.1' : '0.0.0.0';
    runtime.localhost = hostIp || defaultHost;
    runtime.target = target || defaultTarget;
    runtime.scheme = scheme || 'debug';
    runtime.timestamp = runtime.timestamp || Date.now();
    c.configPropsInjects = c.configPropsInjects || [];
    c.systemPropsInjects = c.systemPropsInjects || [];
    c.runtimePropsInjects = generateRuntimePropInjects(runtime);

    if (c.buildConfig) {
        runtime.bundleAssets = getConfigProp('bundleAssets') || false;
        runtime.hosted = hosted && runtime.currentPlatform?.isWebHosted;

        if (c.buildConfig.defaults?.supportedPlatforms) {
            runtime.availablePlatforms = c.buildConfig.defaults.supportedPlatforms;
        }
    }
};

const _getAppId = (c: RnvContext) => {
    logDebug(`_getAppId`);
    const localConfigPath = path.join(c.paths.project.dir, 'renative.local.json');
    if (!fsExistsSync(localConfigPath)) return undefined;
    try {
        const fileAsString = fsReadFileSync(localConfigPath).toString();
        if (!fileAsString) return undefined;

        const appId = JSON.parse(fileAsString)?._meta?.currentAppConfigId;
        return appId;
    } catch (_e) {
        return undefined;
    }
};
