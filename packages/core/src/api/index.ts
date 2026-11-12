import { generateApiDefaults } from './defaults';
import { getApi } from './provider';
import type { RnvApi, RnvApiLogger, RnvApiPrompt, RnvApiSpinner } from './types';

export const createRnvApi = (_api: { spinner: RnvApiSpinner; prompt: RnvApiPrompt; logger: RnvApiLogger }) => {
    if (global.RNV_API?.isInitialized) return;
    const api: RnvApi = generateApiDefaults();
    global.RNV_API = Object.assign(api, _api);
};

export const inquirerPrompt: RnvApiPrompt['inquirerPrompt'] = (opts) => {
    return getApi().prompt.inquirerPrompt(opts);
};

export const inquirerSeparator: RnvApiPrompt['inquirerSeparator'] = (text?: string) => {
    return getApi().prompt.inquirerSeparator(text);
};

export const generateOptions: RnvApiPrompt['generateOptions'] = (inputData, isMultiChoice, mapping, renderMethod) => {
    return getApi().prompt.generateOptions(inputData, isMultiChoice, mapping, renderMethod);
};
