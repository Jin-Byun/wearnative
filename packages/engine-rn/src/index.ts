import { createRnvEngine, type GetContextType } from '@rnv/core';
import ModuleSDKAndroid from '@rnv/sdk-android';
import ModuleSDKReactNative, { withRNVRNConfig } from '@rnv/sdk-react-native';
import { withRNVBabel } from './adapters/babelAdapter';
import { withRNVMetro } from './adapters/metroAdapter';
import { Config } from './config';

const Engine = createRnvEngine({
    tasks: [],
    extendModules: [ModuleSDKAndroid, ModuleSDKReactNative],
    config: Config,
    runtimeExtraProps: {
        reactNativePackageName: 'react-native',
        reactNativeMetroConfigName: 'metro.config.js',
        xcodeProjectName: 'RNVApp'
    },
    platforms: {
        androidwear: {
            defaultPort: 8084,
            extensions: ['androidwear.watch', 'watch', 'androidwear', 'android', 'watch.native', 'native']
        }
    }
});

export type GetContext = GetContextType<typeof Engine.getContext>;

export default Engine;

export { withRNVBabel, withRNVMetro, withRNVRNConfig };
