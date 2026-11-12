import { type ConfigFileTemplate, inquirerPrompt, logDebug } from '@rnv/core';
import lSet from 'lodash/set';
import { getContext } from '../../../getContext';
import type { NewProjectData } from '../types';

type ConfigProp = Required<Required<ConfigFileTemplate>['bootstrapConfig']>['bootstrapQuestions'][number]['configProp'];
type BootstrapQuestions = Required<Required<ConfigFileTemplate>['bootstrapConfig']>['bootstrapQuestions'];
type QuestionResults = Record<
    string,
    {
        answer: string;
        configProp: ConfigProp;
        value: string;
    }
>;

const Question = async (data: NewProjectData) => {
    const c = getContext();
    const { inputs, files } = data;
    inputs.bootstrapQuestions = {};
    const bootstrapQuestions = files.template.renativeTemplateConfig?.bootstrapConfig?.bootstrapQuestions || [];
    const providedAnswers: Record<string, any> = {};
    if (Array.isArray(c.program.opts().answer)) {
        for (const ans of c.program.opts().answer as string[]) {
            const [key, value] = ans.split('=');
            try {
                providedAnswers[key] = JSON.parse(value);
            } catch {
                providedAnswers[key] = value;
            }
        }
    }

    const results: QuestionResults = {};
    await interactiveQuestion(results, bootstrapQuestions, providedAnswers);
    logDebug('asnwer', JSON.stringify(results, null, 2));

    for (const targetKey of Object.keys(results)) {
        if (!targetKey) continue;
        const objValue = results[targetKey].value;
        logDebug('setting', targetKey, objValue);
        lSet(inputs.bootstrapQuestions, targetKey, objValue);
    }
};

const interactiveQuestion = async (
    results: QuestionResults,
    bootstrapQuestions: BootstrapQuestions,
    providedAnswers: Record<string, string>
) => {
    if (!bootstrapQuestions?.length) return;

    for (const { configProp, options, type, title } of bootstrapQuestions) {
        const qKey = configProp?.key || '';
        // inquirer will nest them if they look like an object
        const qKeyClean = qKey.replace('.', '__');

        const choicesObj: Record<string, any> = {};
        if (options) {
            for (const opt of options) {
                choicesObj[opt.title] = opt;
            }
        }

        // answer already passed into the command line
        const answer = providedAnswers[qKey.replace('__', '.')];
        if (answer) {
            const value = typeof answer === 'string' && type === 'list' ? choicesObj[answer]?.value : answer;

            results[qKey] = {
                answer,
                configProp,
                value
            };
        } else {
            const answer = (await inquirerPrompt({
                name: qKeyClean,
                type: type,
                message: title,
                choices: Object.keys(choicesObj)
            })) as string;
            const value: string = type === 'list' ? choicesObj[answer]?.value : answer;
            results[qKey] = {
                answer,
                configProp,
                value
            };
        }

        if (choicesObj[results[qKey].answer]?.bootstrapQuestions) {
            await interactiveQuestion(results, choicesObj[results[qKey].answer].bootstrapQuestions, providedAnswers);
        }
    }
};

export default Question;
