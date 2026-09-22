import merge from 'deepmerge';
import type { ConfigT, InputConfigT } from 'metro-config';

export type InputConfig = InputConfigT;

const getApplicationId = () => process.env.RNV_APP_ID;
const getReactNativePathRelative = () => process.env.RNV_REACT_NATIVE_PATH;
const getProjectRoot = () => process.env.RNV_PROJECT_ROOT;

type InactivePluginConfig = {
    platforms: {
        ios: null;
        android: null;
        macos: null;
        windows: null;
    };
};

const getSkipLinkingDeps = () => {
    const skipLinkingEnv = process.env.RNV_SKIP_LINKING;
    const result: { dependencies?: Record<string, InactivePluginConfig> } = {};
    if (!skipLinkingEnv) return result;
    result.dependencies = skipLinkingEnv
        .split(',')
        .map((item) => item.trim())
        .reduce(
            (acc, plugin) => {
                acc[plugin] = {
                    platforms: {
                        ios: null,
                        android: null,
                        macos: null,
                        windows: null
                    }
                };
                return acc;
            },
            {} as { [plugin: string]: InactivePluginConfig }
        );
    return result;
};

const getAppFolderRelative = () => {
    const pth = process.env.RNV_APP_BUILD_DIR;
    if (pth) return pth;
    const cwd = process.cwd();
    if (!cwd.includes('platformBuilds/')) return;
    return `platformBuilds/${cwd.split('platformBuilds/')[1]}`;
};

export const withRNVRNConfig = (config: any) => {
    const cnfRnv = {
        root: getProjectRoot(),
        //Required to support 2 react native instances
        reactNativePath: getReactNativePathRelative(),
        dependencies: {
            // Required for Expo CLI to be used with platforms (such as Apple TV) that are not supported in Expo SDK
            expo: {
                platforms: {
                    android: null,
                    ios: null,
                    macos: null
                }
            }
        },
        project: {
            ios: {
                sourceDir: getAppFolderRelative()
            },
            android: {
                appName: 'app',
                sourceDir: getAppFolderRelative(),
                packageName: getApplicationId()
            }
        }
    };

    return merge.all([cnfRnv, getSkipLinkingDeps(), config]);
};

export const withMetroConfig = (projectRoot: string): ConfigT => {
    const INTERNAL_CALLSITES_REGEX = new RegExp(
        [
            '/Libraries/BatchedBridge/MessageQueue\\.js$',
            '/Libraries/Core/.+\\.js$',
            '/Libraries/LogBox/.+\\.js$',
            '/Libraries/Network/.+\\.js$',
            '/Libraries/Pressability/.+\\.js$',
            '/Libraries/Renderer/implementations/.+\\.js$',
            '/Libraries/Utilities/.+\\.js$',
            '/Libraries/vendor/.+\\.js$',
            '/Libraries/WebSocket/.+\\.js$',
            '/Libraries/YellowBox/.+\\.js$',
            '/metro-runtime/.+\\.js$',
            '/node_modules/@babel/runtime/.+\\.js$',
            '/node_modules/event-target-shim/.+\\.js$',
            '/node_modules/invariant/.+\\.js$',
            '/node_modules/react-devtools-core/.+\\.js$',
            '/node_modules/react-native/index.js$',
            '/node_modules/react-refresh/.+\\.js$',
            '/node_modules/scheduler/.+\\.js$',
            '^\\[native code\\]$'
        ].join('|')
    );

    const config: InputConfig = {
        resolver: {
            resolverMainFields: ['react-native', 'browser', 'main'],
            platforms: ['android', 'ios'],
            unstable_conditionNames: ['require', 'import', 'react-native'],
            emptyModulePath: require.resolve('metro-runtime/src/modules/empty-module.js', {
                paths: [process.env.RNV_PROJECT_ROOT || process.cwd()]
            })
        },
        serializer: {
            // Note: This option is overridden in cli-plugin-metro (getOverrideConfig)
            getModulesRunBeforeMainModule: () => [
                require.resolve('react-native/Libraries/Core/InitializeCore', {
                    paths: [process.env.RNV_PROJECT_ROOT || process.cwd()]
                })
            ],
            getPolyfills: () =>
                require(
                    require.resolve('@react-native/js-polyfills', {
                        paths: [process.env.RNV_PROJECT_ROOT || process.cwd()]
                    })
                )()
        },
        server: {
            port: Number(process.env.RCT_METRO_PORT) || 8081
        },
        symbolicator: {
            customizeFrame: (frame: Readonly<{ file?: string }>) => {
                const collapse = Boolean(frame.file && INTERNAL_CALLSITES_REGEX.test(frame.file));
                return { collapse };
            }
        },
        transformer: {
            allowOptionalDependencies: true,
            assetRegistryPath: 'react-native/Libraries/Image/AssetRegistry',
            asyncRequireModulePath: require.resolve('metro-runtime/src/modules/asyncRequire', {
                paths: [process.env.RNV_PROJECT_ROOT || process.cwd()]
            }),
            babelTransformerPath: require.resolve('@react-native/metro-babel-transformer'),
            getTransformOptions: async () => ({
                transform: {
                    experimentalImportSupport: false,
                    inlineRequires: true
                }
            })
        },
        watchFolders: [process.env.RNV_MONO_ROOT || process.cwd()]
    };
    const { mergeConfig, getDefaultConfig } = require('metro-config');

    return mergeConfig(getDefaultConfig.getDefaultValues(projectRoot), config);
};

export const mergeConfig = (defaultConfig: ConfigT, ...configs: InputConfig[]): ConfigT => {
    const { mergeConfig } = require('metro-config');
    return mergeConfig(defaultConfig, ...configs);
};
