export * from './constants';
export * from './deviceManager';
export * from './installer';
export * from './runner';

import { createRnvModule, DEFAULTS, type GetContextType } from '@rnv/core';
import taskBuild from './tasks/taskBuild';
import taskConfigure from './tasks/taskConfigure';
import taskLog from './tasks/taskLog';
import taskPackage from './tasks/taskPackage';
import taskRun from './tasks/taskRun';
import taskSdkConfigure from './tasks/taskSdkConfigure';
import taskTargetLaunch from './tasks/taskTargetLaunch';
import taskTargetList from './tasks/taskTargetList';
import type { Payload } from './types';

const RnvModule = createRnvModule({
    tasks: [
        taskTargetLaunch,
        taskTargetList,
        taskSdkConfigure,
        taskLog,
        taskPackage,
        taskConfigure,
        taskRun,
        taskBuild
    ],
    name: '@rnv/sdk-android',
    type: 'internal',
    contextPayload: {
        pluginConfigAndroid: {
            pluginIncludes: "include ':app'",
            pluginPaths: '',
            pluginPackages: '',
            pluginActivityImports: '',
            pluginActivityMethods: '',
            pluginApplicationImports: '',
            pluginApplicationMethods: '',
            reactNativeHostMethods: '',
            pluginApplicationCreateMethods: '',
            pluginApplicationDebugServer: '',
            applyPlugin: '',
            defaultConfig: '',
            pluginActivityCreateMethods: '',
            pluginActivityResultMethods: '',
            pluginSplashActivityImports: '',
            buildGradleAllProjectsRepositories: '',
            buildGradleBuildScriptRepositories: '',
            buildGradlePlugins: '',
            buildGradleAfterAll: '',
            buildGradleBuildScriptDependencies: '',
            injectReactNativeEngine: '',
            injectActivityOnCreate: '',
            buildGradleBuildScriptDexOptions: '',
            appBuildGradleSigningConfigs: '',
            packagingOptions: '',
            appBuildGradleImplementations: '',
            appBuildGradleAfterEvaluate: '',
            kotlinVersion: '',
            googleServicesVersion: '',
            buildToolsVersion: '',
            buildTypes: '',
            compileOptions: '',
            compileSdkVersion: DEFAULTS.compileSdkVersion,
            ndkVersion: '',
            gradleBuildToolsVersion: '',
            gradleWrapperVersion: '',
            localProperties: '',
            minSdkVersion: DEFAULTS.minSdkVersion,
            multiAPKs: '',
            splits: '',
            supportLibVersion: '',
            targetSdkVersion: DEFAULTS.targetSdkVersion,
            settingsGradleInclude: '',
            settingsGradleProject: ''
        }
    } as Payload
});

export default RnvModule;

export type GetContext = GetContextType<typeof RnvModule.getContext>;
