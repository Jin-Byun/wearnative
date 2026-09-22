import { createTask, RnvTaskName, RnvTaskOptions } from '@rnv/core';
import { getTargetWithOptionalPrompt } from '@rnv/sdk-utils';
import { SdkPlatforms } from '../constants';
import { launchAndroidSimulator } from '../deviceManager';
import { checkAndConfigureAndroidSdks, checkAndroidSdk } from '../installer';
import { TaskOptions } from '../taskOptions';

export default createTask({
    description: 'Launch specific target',
    dependsOn: [RnvTaskName.workspaceConfigure],
    fn: async () => {
        await checkAndConfigureAndroidSdks();
        const target = await getTargetWithOptionalPrompt();
        await checkAndroidSdk();
        return launchAndroidSimulator(target);
    },
    task: RnvTaskName.targetLaunch,
    options: [RnvTaskOptions.target, TaskOptions.resetAdb, TaskOptions.skipTargetCheck],
    platforms: SdkPlatforms,
    isGlobalScope: true
});
