import path from 'node:path';
import {
    type ConfigPluginPlatformSchema,
    chalk,
    doResolve,
    doResolvePath,
    fsExistsSync,
    fsWriteFileSync,
    getAppFolder,
    getConfigProp,
    includesPluginPath,
    isSystemWin,
    logDebug,
    logDefault,
    logWarning,
    type OverridesOptions,
    type RnvContext,
    type RnvPlugin,
    sanitizePluginPath,
    writeCleanFile
} from '@rnv/core';
import { addSystemInjects, getAppId, getAppVersion, getAppVersionCode } from '@rnv/sdk-utils';
import { getContext } from './getContext';
import type { Payload, TemplateAndroid } from './types';
import { createOverridesOption, writeParsedFiles } from './utils';

type PluginConfigAndroid = Payload['pluginConfigAndroid'];
const currentOs = process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'win64' : 'linux64';

const parserBaseInjectOptions = (pca: PluginConfigAndroid): OverridesOptions => {
    return [
        createOverridesOption('{{MIN_SDK_VERSION}}', pca.minSdkVersion),
        createOverridesOption('{{TARGET_SDK_VERSION}}', pca.targetSdkVersion),
        createOverridesOption('{{COMPILE_SDK_VERSION}}', pca.compileSdkVersion),
        createOverridesOption(
            '{{PATH_REACT_NATIVE_CODEGEN}}',
            doResolve('@react-native/codegen', true, { forceForwardPaths: true }) || ''
        ),
        createOverridesOption(
            '{{PATH_REACT_NATIVE_CLI_ANDROID}}',
            doResolve('@react-native-community/cli-platform-android', true, {
                forceForwardPaths: true
            }) || ''
        ),
        createOverridesOption(
            '{{PATH_HERMESC}}',
            `${
                doResolve('react-native', true, { forceForwardPaths: true }) || 'react-native'
            }/sdks/hermesc/${currentOs}-bin/hermesc`
        )
    ];
};

export const parseBuildGradleSync = () => {
    const c = getContext();
    const { pluginConfigAndroid } = c.payload;

    const templateAndroid = getConfigProp('templateAndroid');
    const buildscript = templateAndroid?.build_gradle?.buildscript;

    const injects: OverridesOptions = [
        createOverridesOption('{{INJECT_BUILD_TOOLS_VERSION}}', pluginConfigAndroid.gradleBuildToolsVersion),
        createOverridesOption('{{SUPPORT_LIB_VERSION}}', pluginConfigAndroid.supportLibVersion),
        createOverridesOption('{{BUILD_TOOLS_VERSION}}', pluginConfigAndroid.buildToolsVersion),
        createOverridesOption('{{INJECT_KOTLIN_VERSION}}', pluginConfigAndroid.kotlinVersion),
        createOverridesOption('{{INJECT_GOOGLE_SERVICES_VERSION}}', pluginConfigAndroid.googleServicesVersion),
        createOverridesOption('{{INJECT_PLUGINS}}', pluginConfigAndroid.buildGradlePlugins),
        createOverridesOption('{{NDK_VERSION}}', pluginConfigAndroid.ndkVersion),
        createOverridesOption('{{INJECT_AFTER_ALL}}', pluginConfigAndroid.buildGradleAfterAll),
        createOverridesOption('{{INJECT_REACT_NATIVE_ENGINE}}', pluginConfigAndroid.injectReactNativeEngine),
        createOverridesOption(
            '{{PATH_REACT_NATIVE}}',
            doResolve(c.runtime.runtimeExtraProps?.reactNativePackageName || 'react-native', true, {
                forceForwardPaths: true
            }) || ''
        ),

        createOverridesOption('{{INJECT_BUILDSCRIPT_EXT}}', buildscript?.ext?.join('\n') ?? ''),
        createOverridesOption('{{INJECT_BUILDSCRIPT_REPOSITORIES}}', buildscript?.repositories?.join('\n') ?? ''),
        createOverridesOption('{{INJECT_BUILDSCRIPT_CUSTOM}}', buildscript?.custom?.join('\n') ?? ''),
        createOverridesOption('{{INJECT_BUILDSCRIPT_DEPENDENCIES}}', buildscript?.dependencies?.join('\n') ?? ''),
        createOverridesOption(
            '{{INJECT_GRADLE_AFTER_ALL}}',
            templateAndroid?.build_gradle?.injectAfterAll?.join('\n') ?? ''
        )
    ].concat(parserBaseInjectOptions(pluginConfigAndroid));
    addSystemInjects(injects);

    const buildGradle = 'build.gradle';
    writeParsedFiles(buildGradle, injects, c);
};

const setReactNativeEngineDefault = (pca: PluginConfigAndroid) => {
    pca.appBuildGradleImplementations += "    implementation 'org.webkit:android-jsc:+'\n";
};

const setReactNativeEngineV8 = (pca: PluginConfigAndroid) => {
    pca.pluginApplicationImports += `import com.facebook.react.bridge.JavaScriptExecutorFactory
    import com.facebook.react.modules.systeminfo.AndroidInfoHelpers
    import io.csie.kudo.reactnative.v8.executor.V8ExecutorFactory`;

    pca.reactNativeHostMethods += `override fun getJavaScriptExecutorFactory(): JavaScriptExecutorFactory {
            return V8ExecutorFactory(
                applicationContext,
                packageName,
                AndroidInfoHelpers.getFriendlyDeviceName(),
                getUseDeveloperSupport()
            )
        }`;

    pca.packagingOptions += `
    exclude '**/libjsc.so'`;
};

const setReactNativeEngine = (pca: PluginConfigAndroid) => {
    const reactNativeEngine = getConfigProp('reactNativeEngine') || 'hermes';
    pca.injectReactNativeEngine = `
maven { url "${doResolve('react-native', true, { forceForwardPaths: true })}/android" }
maven { url("${doResolve('jsc-android', true, { forceForwardPaths: true })}/dist") }
`;
    switch (reactNativeEngine) {
        case 'jsc':
            setReactNativeEngineDefault(pca);
            break;
        case 'v8-android':
        case 'v8-android-nointl':
        case 'v8-android-jit':
        case 'v8-android-jit-nointl':
            setReactNativeEngineV8(pca);
            break;
        case 'hermes':
            break;
        default: {
            logWarning(`Unsupported react native engine ${reactNativeEngine}. Will use hermes instead`);
        }
    }
};

export const parseAppBuildGradleSync = () => {
    logDefault('parseAppBuildGradleSync');
    const c = getContext();
    if (!c.platform) return;

    const appFolder = getAppFolder();
    const { pluginConfigAndroid } = c.payload;

    // ANDROID PROPS
    pluginConfigAndroid.minSdkVersion = getConfigProp('minSdkVersion') || 24;
    pluginConfigAndroid.targetSdkVersion = getConfigProp('targetSdkVersion') || 34;
    pluginConfigAndroid.compileSdkVersion = getConfigProp('compileSdkVersion') || 35;
    pluginConfigAndroid.ndkVersion = getConfigProp('ndkVersion') || '26.1.10909125';
    pluginConfigAndroid.gradleBuildToolsVersion = getConfigProp('gradleBuildToolsVersion') || '4.2.2';
    pluginConfigAndroid.supportLibVersion = getConfigProp('supportLibVersion') || '28.0.0';
    pluginConfigAndroid.buildToolsVersion = getConfigProp('buildToolsVersion') || '35.0.0';
    pluginConfigAndroid.kotlinVersion = getConfigProp('kotlinVersion') || '1.9.24';
    pluginConfigAndroid.googleServicesVersion = getConfigProp('googleServicesVersion') || '4.2.0';

    setReactNativeEngine(pluginConfigAndroid);
    // SIGNING CONFIGS
    const debugSigning = `
    debug {
        storeFile file('debug.keystore')
        storePassword "android"
        keyAlias "androiddebugkey"
        keyPassword "android"
    }`;

    pluginConfigAndroid.appBuildGradleSigningConfigs = `${debugSigning}
    release`;
    pluginConfigAndroid.localProperties = '';

    const storeFile = getConfigProp('storeFile');
    const keystoreProps: Record<string, string> = {
        keyAlias: getConfigProp('keyAlias') as string,
        storePassword: getConfigProp('storePassword') as string,
        keyPassword: getConfigProp('keyPassword') as string
    };
    const minifyEnabled = getConfigProp('minifyEnabled');

    pluginConfigAndroid.store = {
        storeFile
    };

    if (storeFile) {
        if (Object.values(keystoreProps).every(Boolean)) {
            //NOTE: because of merged logic we don't know whether renative.private.json
            // values come from project or appConfig so we selectively check both
            let keystorePathFull = !storeFile.startsWith('.')
                ? storeFile
                : ['', c.paths.workspace.appConfig.dir, c.paths.workspace.project.dir].find((v) =>
                      fsExistsSync(path.join(v, keystoreProps.storeFile))
                  );
            if (keystorePathFull) {
                if (isSystemWin) {
                    keystorePathFull = keystorePathFull.replace(/\\/g, '/');
                }
                const genPropsPath = path.join(appFolder, 'keystore.properties');
                fsWriteFileSync(
                    genPropsPath,
                    ['# auto generated by ReNative', `storeFile=${keystorePathFull}`]
                        .concat(Object.entries(keystoreProps).map(([k, v]) => `${k}=${v}`))
                        .join('\n')
                );

                pluginConfigAndroid.appBuildGradleSigningConfigs = `${debugSigning}
      release {
          storeFile file(keystoreProps['storeFile'])
          ${Object.keys(keystoreProps)
              .map((k) => `${k} keystoreProps['${k}']`)
              .join('\n')}
      }`;

                pluginConfigAndroid.localProperties = `
def keystorePropsFile = rootProject.file("keystore.properties")
def keystoreProps = new Properties()
keystoreProps.load(new FileInputStream(keystorePropsFile))`;
            } else {
                logWarning(
                    `Your ${chalk.bold.white(
                        storeFile
                    )} does not exist. You won't be able to make production releases without it!`
                );
            }
        } else {
            logWarning(`You defined store file ${chalk.bold.white(
                storeFile
            )}, but you are missing following keys: ${chalk.red(
                Object.keys(keystoreProps)
                    .filter((k) => !keystoreProps[k])
                    .join(', ')
            )}
Check your private files at:
${chalk.bold.white(c.paths.workspace?.appConfig?.configsPrivate?.join('\n'))}`);
        }
    }

    // BUILD_TYPES
    const appBuildGradle = getConfigProp('templateAndroid')?.app_build_gradle;
    const { debug: debugBuildTypes = [], release: releaseBuildTypes = [] } = appBuildGradle?.buildTypes ?? {};
    const isSigningDisabled = getConfigProp('disableSigning') === true;
    pluginConfigAndroid.buildTypes = `
    debug {
        minifyEnabled ${minifyEnabled}
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        ${debugBuildTypes.join('\n        ')}
    }
    release {
        minifyEnabled ${minifyEnabled}
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        ${isSigningDisabled ? '' : 'signingConfig signingConfigs.release'}
        ${releaseBuildTypes.join('\n        ')}
    }`;

    // APP/BUILD.GRADLE
    _parseAppBuildGradleObject(pluginConfigAndroid, appBuildGradle);

    // MULTI APK
    const isMultiApk = getConfigProp('multipleAPKs') === true;
    pluginConfigAndroid.multiAPKs = '';

    // SPLITS
    pluginConfigAndroid.splits = isMultiApk
        ? ''
        : `
    splits {
      abi {
          reset()
          enable true
          include "armeabi-v7a", "x86", "arm64-v8a", "x86_64"
          universalApk false
      }
    }
`;

    // PACKAGING OPTIONS
    pluginConfigAndroid.packagingOptions += `
    exclude 'META-INF/DEPENDENCIES.txt'
    exclude 'META-INF/DEPENDENCIES'
    exclude 'META-INF/dependencies.txt'
    exclude 'META-INF/LICENSE.txt'
    exclude 'META-INF/LICENSE'
    exclude 'META-INF/license.txt'
    exclude 'META-INF/LGPL2.1'
    exclude 'META-INF/NOTICE.txt'
    exclude 'META-INF/NOTICE'
    exclude 'META-INF/notice.txt'
    pickFirst 'lib/armeabi-v7a/libc++_shared.so'
    pickFirst 'lib/x86_64/libc++_shared.so'
    pickFirst 'lib/x86/libc++_shared.so'
    pickFirst 'lib/arm64-v8a/libc++_shared.so'
    pickFirst 'lib/arm64-v8a/libjsc.so'
    pickFirst 'lib/x86_64/libjsc.so'`;

    // COMPILE OPTIONS
    pluginConfigAndroid.compileOptions = `
    sourceCompatibility 1.8
    targetCompatibility 1.8`;

    const injects: OverridesOptions = [
        createOverridesOption('{{PLUGIN_APPLY}}', pluginConfigAndroid.applyPlugin),
        createOverridesOption('{{APPLICATION_ID}}', getAppId()),
        createOverridesOption('{{VERSION_CODE}}', getAppVersionCode()),
        createOverridesOption('{{VERSION_NAME}}', getAppVersion()),
        createOverridesOption('{{PLUGIN_IMPLEMENTATIONS}}', pluginConfigAndroid.appBuildGradleImplementations),
        createOverridesOption('{{PLUGIN_AFTER_EVALUATE}}', pluginConfigAndroid.appBuildGradleAfterEvaluate),
        createOverridesOption('{{PLUGIN_SIGNING_CONFIGS}}', pluginConfigAndroid.appBuildGradleSigningConfigs),
        createOverridesOption('{{PLUGIN_SPLITS}}', pluginConfigAndroid.splits),
        createOverridesOption('{{PLUGIN_ANDROID_DEFAULT_CONFIG}}', pluginConfigAndroid.defaultConfig),
        createOverridesOption('{{PLUGIN_PACKAGING_OPTIONS}}', pluginConfigAndroid.packagingOptions),
        createOverridesOption('{{PLUGIN_BUILD_TYPES}}', pluginConfigAndroid.buildTypes),
        createOverridesOption('{{PLUGIN_MULTI_APKS}}', pluginConfigAndroid.multiAPKs),
        createOverridesOption('{{PLUGIN_COMPILE_OPTIONS}}', pluginConfigAndroid.compileOptions),
        createOverridesOption('{{PLUGIN_LOCAL_PROPERTIES}}', pluginConfigAndroid.localProperties),
        createOverridesOption(
            '{{PATH_REACT_NATIVE}}',
            doResolve(c.runtime.runtimeExtraProps?.reactNativePackageName || 'react-native', true, {
                forceForwardPaths: true
            })
        ),
        createOverridesOption('{{PATH_HERMES_ENGINE}}', doResolve('hermes-engine', true, { forceForwardPaths: true })),
        createOverridesOption('{{INJECT_KOTLIN_VERSION}}', pluginConfigAndroid.kotlinVersion)
    ].concat(parserBaseInjectOptions(pluginConfigAndroid));
    addSystemInjects(injects);

    const buildGradle = 'app/build.gradle';
    writeParsedFiles(buildGradle, injects, c);
};

export const parseSettingsGradleSync = () => {
    const c = getContext();
    const appFolder = getAppFolder();
    const rnCliLocation =
        doResolve('@react-native-community/cli-platform-android', true, { forceForwardPaths: true }) || '';
    const rnGradlePluginLocation = doResolve('@react-native/gradle-plugin', true, { forceForwardPaths: true }) || '';

    const rnCliRelativePath = rnCliLocation && path.relative(appFolder, rnCliLocation).replace(/\\/g, '/');
    const rnGradlePluginRelativePath =
        rnGradlePluginLocation && path.relative(appFolder, rnGradlePluginLocation).replace(/\\/g, '/');

    const injects: OverridesOptions = [
        createOverridesOption('{{PLUGIN_INCLUDES}}', c.payload.pluginConfigAndroid.pluginIncludes),
        createOverridesOption('{{PLUGIN_PATHS}}', c.payload.pluginConfigAndroid.pluginPaths),
        createOverridesOption('{{RN_CLI_LOCATION}}', rnCliRelativePath),
        createOverridesOption('{{RN_GRADLE_PLUGIN_LOCATION}}', rnGradlePluginRelativePath),
        createOverridesOption('{{RN_GRADLE_PROJECT_NAME}}', c.files.project.config?.projectName?.replace('/', '-')),
        createOverridesOption('{{SETTINGS_GRADLE_INCLUDE}}', c.payload.pluginConfigAndroid.settingsGradleInclude),
        createOverridesOption('{{SETTINGS_GRADLE_PROJECT}}', c.payload.pluginConfigAndroid.settingsGradleProject)
    ];
    addSystemInjects(injects);

    const settingsGradle = 'settings.gradle';
    writeParsedFiles(settingsGradle, injects, c);
};

export const parseGradlePropertiesSync = () => {
    const c = getContext();
    if (!c.platform) return;

    // GRADLE.PROPERTIES
    const gradleProps = getConfigProp('templateAndroid')?.gradle_properties;
    const pluginGradleProperties = Object.entries(gradleProps ?? {})
        .map(([key, value]) => `${key}=${value}\n`)
        .join('');

    const newArchEnabled = getConfigProp('newArchEnabled');
    const reactNativeEngine = getConfigProp('reactNativeEngine') || 'hermes';

    const injects: OverridesOptions = [
        createOverridesOption('{{PLUGIN_GRADLE_PROPERTIES}}', pluginGradleProperties),
        createOverridesOption('{{NEW_ARCH_ENABLED}}', newArchEnabled ? 'true' : 'false'),
        createOverridesOption('{{INJECT_HERMES_ENABLED}}', reactNativeEngine === 'hermes' ? 'true' : 'false')
    ];

    addSystemInjects(injects);

    const gradleProperties = 'gradle.properties';
    writeParsedFiles(gradleProperties, injects, c);
};

export const injectPluginGradleSync = (pluginRoot: RnvPlugin, plugin: ConfigPluginPlatformSchema, key: string) => {
    const c = getContext();
    const { pluginConfigAndroid } = c.payload;
    const pathFixed = plugin.path || `${key}/android`;
    const skipPathResolutions = pluginRoot.disableNpm;
    let pathAbsolute: string = '';

    if (!skipPathResolutions) {
        if (includesPluginPath(pathFixed)) {
            pathAbsolute = sanitizePluginPath(pathFixed, key, true, { forceForwardPaths: true });
        } else {
            pathAbsolute = doResolvePath(pathFixed, true, { forceForwardPaths: true });
        }
    }

    // APP/BUILD.GRADLE
    if (!plugin.skipImplementation && plugin.implementation) {
        pluginConfigAndroid.appBuildGradleImplementations += `${plugin.implementation}\n`;
    }

    // SETTINGS.GRADLE
    // Make sure values by default are not undefined
    if (!pluginConfigAndroid.settingsGradleInclude) pluginConfigAndroid.settingsGradleInclude = '';
    if (!pluginConfigAndroid.settingsGradleProject) pluginConfigAndroid.settingsGradleProject = '';
    // Add the needed injections for the plugin
    if (plugin.templateAndroid?.settings_gradle) {
        pluginConfigAndroid.settingsGradleInclude +=
            plugin.templateAndroid.settings_gradle.include?.map((prjLine: string) => `, ${prjLine}`)?.join('') ?? '';
        pluginConfigAndroid.settingsGradleProject +=
            plugin.templateAndroid.settings_gradle.project
                ?.map((prjLine: string) => `${sanitizePluginPath(prjLine, key)}\n`)
                ?.join('') ?? '';
    }

    parseAndroidConfigObject(plugin, key);
    if (pathAbsolute) {
        _fixAndroidLegacy(c, pathAbsolute);
    }
};

export const parseAndroidConfigObject = (plugin?: ConfigPluginPlatformSchema, key = '') => {
    // APP/BUILD.GRADLE
    const c = getContext();
    const templateAndroid = plugin?.templateAndroid;
    const { pluginConfigAndroid } = c.payload;
    const appBuildGradle = templateAndroid?.app_build_gradle;
    _parseAppBuildGradleObject(pluginConfigAndroid, appBuildGradle, key);

    // BUILD.GRADLE
    const buildGradle = templateAndroid?.build_gradle;
    if (!buildGradle) return;

    const { plugins = [], injectAfterAll = [] } = buildGradle;
    pluginConfigAndroid.buildGradlePlugins += plugins.map((k) => `${k}\n`).join('');
    pluginConfigAndroid.buildGradleAfterAll += injectAfterAll.map((k) => `${sanitizePluginPath(k, key)}\n`).join('');
};

const _fixAndroidLegacy = (c: RnvContext, modulePath: string) => {
    const buildGradle = path.join(c.paths.project.dir, modulePath, 'build.gradle');

    logDebug('FIX:', buildGradle);
    writeCleanFile(
        buildGradle,
        buildGradle,
        [
            createOverridesOption(" compile '", "  implementation '"),
            createOverridesOption(' compile "', '  implementation "'),
            createOverridesOption(' testCompile "', '  testImplementation "'),
            createOverridesOption(" provided '", "  compileOnly '"),
            createOverridesOption(' provided "', '  compileOnly "'),
            createOverridesOption(' compile fileTree', '  implementation fileTree')
        ],
        undefined,
        c
    );
};

const _parseAppBuildGradleObject = (
    pca: PluginConfigAndroid,
    appBuildGradle: TemplateAndroid['app_build_gradle'] | undefined,
    key = ''
) => {
    if (!appBuildGradle) return;
    const { apply, defaultConfig, implementations, afterEvaluate } = appBuildGradle;
    pca.applyPlugin +=
        apply
            ?.map((v) =>
                v.startsWith('apply') ? `${sanitizePluginPath(v, key)}\n` : `apply ${sanitizePluginPath(v, key)}\n`
            )
            ?.join('') ?? '';

    pca.appBuildGradleImplementations +=
        implementations?.map((v) => `    implementation ${sanitizePluginPath(v, key)}\n`)?.join('') ?? '';
    pca.defaultConfig += defaultConfig?.map((v) => `${sanitizePluginPath(v, key)}\n`)?.join('') ?? '';
    pca.appBuildGradleAfterEvaluate += afterEvaluate?.map((v) => ` ${sanitizePluginPath(v, key)}\n`)?.join('') ?? '';
};
