import { getConfigProp } from '../context/contextProps';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { logDefault } from '../logger';
import { parsePlugins } from '../plugins';
import { fsReaddirSync } from '../system/fs';
import type { ParseFontsCallback } from './types';
import { resolveRelativePackage } from './utils';

const readAndCallFonts = (dirPath: string, callback: ParseFontsCallback) => {
    try {
        for (const font of fsReaddirSync(dirPath)) {
            callback(font, dirPath);
        }
    } catch {}
};
export const parseFonts = (callback: ParseFontsCallback) => {
    logDefault('parseFonts');

    const c = getContext();

    if (!c.buildConfig) return;
    // FONTS - PROJECT CONFIG
    readAndCallFonts(c.paths.project.appConfigBase.fontsDir, callback);
    // FONTS - APP CONFIG
    for (const path of c.paths.appConfig.fontsDirs || []) {
        readAndCallFonts(path, callback);
    }
    if (!c.paths.appConfig.fontsDirs) {
        readAndCallFonts(c.paths.appConfig.fontsDir, callback);
    }
    _parseFontSources(c, getConfigProp('fontSources') || [], callback);
    // PLUGIN FONTS
    parsePlugins((plugin) => {
        if (plugin.config?.fontSources) {
            _parseFontSources(c, plugin.config.fontSources, callback);
        }
    }, true);
};

const _parseFontSources = (c: RnvContext, fontSourcesArr: Array<string>, callback: ParseFontsCallback) => {
    if (!callback) return;
    const fontSources = fontSourcesArr.map((v) => resolveRelativePackage(c, v));
    for (const dir of fontSources) {
        readAndCallFonts(dir, callback);
    }
};
