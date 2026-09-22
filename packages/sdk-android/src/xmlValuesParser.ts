import path from 'node:path';
import {
    type ConfigAndroidResources,
    type ConfigTemplateAndroidBase,
    getConfigProp,
    getContext,
    getFlavouredProp,
    logDefault,
    logError,
    type OverridesOptions,
    parsePlugins,
    RnvFolderName,
    readObjectSync
} from '@rnv/core';
import { addSystemInjects, getAppTitle, sanitizeColor } from '@rnv/sdk-utils';
import { _convertToXML, _mergeNodeChildren, _mergeNodeParameters } from './manifestParser';
import type { TargetResourceFile } from './types';
import { createOverridesOption, writeParsedFiles } from './utils';

export const parseValuesXml = (
    objArr: (ConfigTemplateAndroidBase | undefined)[],
    targetRes: TargetResourceFile,
    injectValue = false
) => {
    const c = getContext();
    logDefault(`parseValuesXml: ${targetRes}`);
    if (!c.platform) return;

    try {
        const baseResoutcesFilePath = path.join(
            __dirname,
            RnvFolderName.UP,
            RnvFolderName.templateFiles,
            `${targetRes}.json`
        );
        const baseResourcesFile = readObjectSync<ConfigAndroidResources>(baseResoutcesFilePath);
        if (!baseResourcesFile) return;

        // PARSE all standard renative.*.json files in correct mergeOrder
        for (const tpl of objArr) {
            const resourceObj = tpl?.[targetRes];
            if (!resourceObj) continue;
            _mergeNodeParameters(baseResourcesFile, resourceObj);
            _mergeNodeChildren(baseResourcesFile, resourceObj.children);
        }

        // appConfigs/base/plugins.json PLUGIN CONFIG OVERRIDES
        parsePlugins((_plugin, pluginPlat) => {
            const resourcesPlugin = getFlavouredProp(pluginPlat, 'templateAndroid')?.[targetRes];
            _mergeNodeChildren(baseResourcesFile, resourcesPlugin?.children);
        });

        const resourceXml = _convertToXML(baseResourcesFile);
        const injects: OverridesOptions = [createOverridesOption(_getPattern(targetRes), resourceXml || '')];
        addSystemInjects(injects);

        const resourceFile = `app/src/main/res/values/${targetRes.replace('_', '.')}`;
        writeParsedFiles(resourceFile, injects, c);
        if (injectValue) {
            _overrideDynamicValue(resourceFile);
        }
    } catch (e) {
        logError(e);
    }
};

const _getPattern = (targetRes: TargetResourceFile): string => `{{PLUGIN_${targetRes.toUpperCase()}_FILE}}`;

const _overrideDynamicValue = (stringsPath: string) => {
    const c = getContext();

    const injects: OverridesOptions = [
        createOverridesOption(
            '{{PLUGIN_COLORS_BG}}',
            sanitizeColor(getConfigProp('backgroundColor'), 'backgroundColor') || '#FFFFFF'
        ),
        createOverridesOption('{{APP_TITLE}}', getAppTitle() || '')
    ];
    addSystemInjects(injects);

    writeParsedFiles(stringsPath, injects, c);
};
