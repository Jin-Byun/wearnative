import { createTask, RnvTaskName } from '@rnv/core';
import { SdkPlatforms } from '../constants';
import { checkAndConfigureAndroidSdks, checkAndroidSdk } from '../installer';

export default createTask({
    description: 'Configures sdks',
    isPrivate: true,
    fn: async () => {
        await checkAndConfigureAndroidSdks();
        return checkAndroidSdk();
    },
    task: RnvTaskName.sdkConfigure,
    platforms: SdkPlatforms
});
