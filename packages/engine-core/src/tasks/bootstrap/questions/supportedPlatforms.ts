import { getContext, inquirerPrompt, logError, type RnvPlatformKey, RnvPlatforms } from '@rnv/core';
import { checkInputValue } from '../questionHelpers';
import type { NewProjectData } from '../types';

const Question = async ({ inputs, files }: NewProjectData) => {
    const c = getContext();
    const { platform } = c.program.opts();

    const supportedPlatforms = files.template.renativeConfig?.defaults?.supportedPlatforms || [];
    if (supportedPlatforms.length === 0) {
        logError(
            `Template ${inputs.template?.packageName} does not seem to export any default platforms to support. contact the author.`
        );
    }

    supportedPlatforms.sort((a, b) => RnvPlatforms.indexOf(a) - RnvPlatforms.indexOf(b));

    const optsPlatforms = c.program.opts().platform && [c.program.opts().platform];
    const selectedPlatforms =
        optsPlatforms ||
        files.template.renativeTemplateConfig?.bootstrapConfig?.defaultSelectedPlatforms ||
        supportedPlatforms;

    if (checkInputValue(platform)) {
        inputs.supportedPlatforms = platform.split(',') as RnvPlatformKey[];
        return;
    }
    inputs.supportedPlatforms = (await inquirerPrompt({
        name: 'inputSupportedPlatforms',
        type: 'checkbox',
        pageSize: 20,
        message: 'What platforms would you like to use?',
        validate: (val) => !!val.length || 'Please select at least a platform',
        default: selectedPlatforms,
        choices: supportedPlatforms
    })) as RnvPlatformKey[];
};

export default Question;
