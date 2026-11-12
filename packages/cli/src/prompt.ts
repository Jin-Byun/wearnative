import { checkbox, confirm, input, password, rawlist, Separator, search, select } from '@inquirer/prompts';
import {
    getContext,
    type PromptChoice,
    type PromptOptions,
    type PromptParams,
    type PromptRenderFn,
    type PromptSource
} from '@rnv/core';
import { chalk, logDebug, logTask, logWarning } from './logger';

export const inquirerPrompt = async (params: PromptParams): Promise<any> => {
    const c = getContext();
    const { yes, ci } = c.program?.opts() ?? {};
    const { type, name, default: paramDefault, message } = params;

    if (yes) {
        if (type === 'confirm') {
            return true;
        }
        if (paramDefault) return typeof paramDefault === 'function' ? paramDefault() : paramDefault;
    }

    const msg = params.logMessage || params.warningMessage || message;
    if (ci) {
        if (paramDefault !== undefined && Array.isArray(params.choices) && params.choices.includes(paramDefault)) {
            logDebug(`defaulting to choice '${paramDefault}' for prompt '${name}'`);
            if (name) return paramDefault;
        }
        throw new Error(`--ci option does not allow prompts. question: ${msg}.`);
    }
    if (msg) {
        if (params.logMessage) logTask(msg, chalk.grey);
        if (params.warningMessage) logWarning(msg);
    }

    switch (type) {
        case 'password':
            return password({ message });
        case 'confirm':
            return confirm({ message, default: paramDefault });
        case 'input':
            return input({ message, default: paramDefault, validate: params.validate });
        case 'checkbox':
            return checkbox({
                message,
                choices: params.choices as PromptChoice,
                pageSize: params.pageSize,
                loop: params.loop
            });
        case 'rawlist':
            return rawlist({
                message,
                choices: params.choices as PromptChoice,
                default: paramDefault,
                loop: params.loop
            });
        case 'select':
        case 'list':
            return select({
                message,
                choices: params.choices as PromptChoice,
                default: paramDefault,
                pageSize: params.pageSize,
                loop: params.loop
            });
        case 'search':
        case 'autocomplete':
            return search({
                message,
                source: params.source as PromptSource,
                default: paramDefault,
                pageSize: params.pageSize,
                initialValue: params.initialValue
            });
    }
    throw new Error(`Prompt type: ${type} not available`);
};

export const inquirerSeparator = (text?: string): Separator => new Separator(text);

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
    if (typeof a === 'string') {
        return a.toLowerCase().localeCompare(b.toLowerCase());
    }
    const aStr = a?.name?.toLowerCase() ?? '';
    const bStr = b?.name?.toLowerCase() ?? '';
    return aStr.localeCompare(bStr);
};

const _generateOptionString = (i: number, _obj: any, mapping: any, defaultVal: string) =>
    ` [${chalk.bold.grey(i + 1)}]> ${chalk.bold.grey(mapping ? '' : defaultVal)} \n`;

export default {
    inquirerPrompt,
    generateOptions,
    inquirerSeparator
};
