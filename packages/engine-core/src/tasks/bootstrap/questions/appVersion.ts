import { merge } from 'lodash';
import semver from 'semver';
import { getContext } from '../../../getContext';
import { validateAndAssign } from '../questionHelpers';
import type { NewProjectData } from '../types';

const Question = async ({ inputs, defaults, files }: NewProjectData) => {
    const c = getContext();
    const { appVersion, ci } = c.program.opts();
    const warningMsg = 'Please enter a valid semver version (1.0.0, 42.6.7.9.3-alpha, etc.)';
    const validator = (version: string) => !!semver.valid(semver.coerce(version)) || warningMsg;

    const result = await validateAndAssign(
        {
            value: appVersion,
            validFn: validator,
            name: 'inputVersion',
            defaultVal: defaults.appVersion,
            message: "What's your project version?",
            warning: `Command contains invalid appVersion. ${warningMsg}`
        },
        ci
    );

    inputs.appVersion = result || defaults.appVersion;
    files.project.packageJson = merge(files.project.packageJson, { version: inputs.appVersion });
};

export default Question;
