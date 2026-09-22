import { createTask, getConfigProp, logSummary, RnvTaskName, RnvTaskOptionPresets } from '@rnv/core';
import { startBundlerIfRequired, waitForBundlerIfRequired } from '@rnv/sdk-react-native';
import { SdkPlatforms } from '../constants';
import { getAndroidDeviceToRunOn, packageAndroid, runAndroid } from '../runner';
import { TaskOptions } from '../taskOptions';
import type { AndroidDevice } from '../types';

export default createTask({
    description: 'Run your rn app on target device or emulator',
    dependsOn: [RnvTaskName.configure],
    fn: async ({ ctx, originTaskName }) => {
        const bundleAssets = getConfigProp('bundleAssets');

        const runDevice = await getAndroidDeviceToRunOn();
        if (runDevice) {
            ctx.runtime.target = runDevice?.name || runDevice?.udid;
        }
        if (!ctx.program.opts().only) {
            await startBundlerIfRequired(RnvTaskName.run, originTaskName);
            if (bundleAssets || ctx.platform === 'androidwear') {
                await packageAndroid();
            }
            await runAndroid(runDevice as AndroidDevice);
            if (!bundleAssets) {
                logSummary({ header: 'BUNDLER STARTED' });
            }
            return waitForBundlerIfRequired();
        }
        await runAndroid(runDevice as AndroidDevice);
    },
    task: RnvTaskName.run,
    isPriorityOrder: true,
    options: [
        ...RnvTaskOptionPresets.withConfigure(),
        ...RnvTaskOptionPresets.withRun(),
        TaskOptions.resetAdb,
        TaskOptions.skipTargetCheck,
        TaskOptions.uninstall
    ],
    platforms: SdkPlatforms
});
