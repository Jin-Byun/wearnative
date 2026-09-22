import { createTask, RnvTaskName, RnvTaskOptionPresets } from '@rnv/core';
import { SdkPlatforms } from '../constants';
import { ejectGradleProject } from '../ejector';

export default createTask({
    description: 'Eject current project app to self contained native project',
    beforeDependsOn: async ({ ctx }) => {
        ctx.runtime._platformBuildsSuffix = '_eject/android';
        ctx.runtime._skipNativeDepResolutions = true;
    },
    dependsOn: [RnvTaskName.package],
    fn: async () => {
        return ejectGradleProject();
    },
    task: RnvTaskName.eject,
    options: RnvTaskOptionPresets.withConfigure(),
    platforms: SdkPlatforms
});
