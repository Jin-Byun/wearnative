import { getContext, type PromptOptions, type PromptParams, type PromptRenderFn } from '@rnv/core';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { chalk, logDebug, logTask, logWarning } from './logger';

inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export const inquirerPrompt = async (params: PromptParams): Promise<Record<string, any>> => {
    const c = getContext();

    if (c.program?.opts()?.yes) {
        const key = params.name || params.type;
        if (params.type === 'confirm') {
            return { [key]: true };
        }
        if (params.default) {
            return {
                [key]: typeof params.default === 'function' ? params.default() : params.default
            };
        }
    }

    const msg = params.logMessage || params.warningMessage || params.message;
    if (c.program?.opts()?.ci) {
        if (
            Array.isArray(params.choices) &&
            typeof params.default !== 'undefined' &&
            params.choices.includes(params.default)
        ) {
            logDebug(`defaulting to choice '${params.default}' for prompt '${params.name}'`);

            if (params.name) return { [params.name]: params.default };
        }
        return Promise.reject(`--ci option does not allow prompts. question: ${msg}.`);
    }
    if (msg) {
        if (params.logMessage) logTask(msg, chalk.grey);
        if (params.warningMessage) logWarning(msg);
    }

    // allow passing in just { type: 'prompt', ... } instead of { type: 'prompt', name: 'prompt', ... }
    const { type, name } = params;
    if (type === 'confirm' && !name) params.name = 'confirm';

    const resp = inquirer.prompt(params as any);
    if (params.initialValue) resp.ui.rl.input.push(params.initialValue);
    return resp;
};

export const inquirerSeparator = (text?: string) => {
    return new inquirer.Separator(text);
};

export const generateOptions = (
    inputData: any,
    isMultiChoice = false,
    mapping?: any,
    renderMethod?: PromptRenderFn
): PromptOptions => {
    logDebug('generateOptions', String(isMultiChoice));

    const isArray = Array.isArray(inputData);
    const n = isArray ? inputData.length : Object.keys(inputData).length;
    const valuesAsArray: Array<any> = new Array(n);
    const optionsAsArray: Array<any> = new Array(n);
    const keysAsArray: Array<any> = !isArray || !mapping ? new Array(n) : [];
    const valuesAsObject: Record<string, any> = {};
    const keysAsObject: Record<string, any> = {};

    const renderer = renderMethod || _generateOptionString;
    if (isArray) {
        inputData.forEach((v, i) => {
            const rn = renderer(i, v, mapping, v);
            optionsAsArray[i] = rn;
            valuesAsArray[i] = v;
            if (!mapping) {
                keysAsArray[i] = v;
                valuesAsObject[v] = v;
            }
        });
    } else {
        Object.entries(inputData).forEach(([k, v], i) => {
            const rn = renderer(i, v, mapping, k);
            optionsAsArray[i] = rn;
            valuesAsArray[i] = v;
            keysAsArray[i] = k;
            keysAsObject[k] = true;
            valuesAsObject[k] = v;
        });
    }
    return {
        keysAsArray: keysAsArray.sort(_sort),
        valuesAsArray: valuesAsArray.sort(_sort),
        keysAsObject,
        valuesAsObject,
        asString: optionsAsArray.join(''),
        optionsAsArray
    };
};

const _sort = (a: any, b: any) => {
    let aStr = '';
    let bStr = '';
    if (typeof a === 'string') {
        aStr = a.toLowerCase();
        bStr = b.toLowerCase();
    } else {
        if (a?.name) aStr = a.name.toLowerCase();
        if (b?.name) bStr = b.name.toLowerCase();
    }

    let com = 0;
    if (aStr > bStr) {
        com = 1;
    } else if (aStr < bStr) {
        com = -1;
    }
    return com;
};

const _generateOptionString = (i: number, _obj: any, mapping: any, defaultVal: string) =>
    ` [${chalk.bold.grey(i + 1)}]> ${chalk.bold.grey(mapping ? '' : defaultVal)} \n`;

export default {
    inquirerPrompt,
    generateOptions,
    inquirerSeparator
};
