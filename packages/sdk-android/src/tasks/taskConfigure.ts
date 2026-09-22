import { createTask, RnvTaskName, RnvTaskOptionPresets } from '@rnv/core';
import { configureFontSources } from '@rnv/sdk-react-native';
import { SdkPlatforms } from '../constants';
import { configureGradleProject } from '../runner';

export default createTask({
    description: 'Configure current project',
    fn: async () => {
        await configureGradleProject();
        return configureFontSources();
    },
    task: RnvTaskName.configure,
    dependsOn: [RnvTaskName.platformConfigure],
    options: RnvTaskOptionPresets.withConfigure(),
    platforms: SdkPlatforms
});
