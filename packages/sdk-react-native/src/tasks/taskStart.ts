import { createTask, doResolve, RnvTaskName, RnvTaskOptionPresets } from '@rnv/core';
import { SdkPlatforms } from '../constants';
import { startReactNative } from '../metroRunner';

export default createTask({
    description: 'Starts react-native bundler',
    dependsOn: [RnvTaskName.configureSoft],
    //TODO: implement dependsOnTrigger
    // dependsOnTrigger: ({ parentTaskName }) => !parentTaskName,
    fn: async ({ ctx, parentTaskName }) => {
        const { hosted } = ctx.program.opts();
        if (hosted) {
            return Promise.reject('This platform does not support hosted mode');
        }
        // Disable reset for other commands (ie. cleaning platforms)
        ctx.runtime.disableReset = true;
        const { reactNativePackageName, reactNativeMetroConfigName: metroConfigName } =
            ctx.runtime?.runtimeExtraProps || {};
        const customCliPath: string | undefined = reactNativePackageName
            ? `${doResolve(reactNativePackageName)}/cli.js`
            : undefined;
        return startReactNative({ waitForBundler: !parentTaskName, customCliPath, metroConfigName });
    },
    task: RnvTaskName.start,
    options: RnvTaskOptionPresets.withConfigure(),
    platforms: SdkPlatforms
});
