import type { RnvContextProgram } from '@rnv/core';
import { getContext } from '../../../getContext';
import type { EngineTaskOptionKey } from '../../../taskOptions';
import { checkInputValue, validateAndAssign } from '../questionHelpers';
import type { NewProjectData } from '../types';

const Question = async ({ inputs, defaults }: NewProjectData) => {
    const c = getContext();
    const { title, ci } = (c.program as RnvContextProgram<EngineTaskOptionKey>).opts();
    const validator = (val: string) => checkInputValue(val) || 'Please enter a title';

    const result = await validateAndAssign(
        {
            value: title,
            validFn: validator,
            name: 'inputAppTitle',
            defaultVal: defaults.appTitle,
            message: "What's your project Title?",
            warning: 'Title was not provided'
        },
        ci
    );

    inputs.appTitle = result || defaults.appTitle;
};

export default Question;
