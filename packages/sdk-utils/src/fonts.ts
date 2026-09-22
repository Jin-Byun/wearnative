import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
    chalk,
    fsExistsSync,
    fsReadFileSync,
    fsWriteFileSync,
    getConfigProp,
    getContext,
    logDebug,
    logWarning,
    parseFonts
} from '@rnv/core';

const FONT_EXTENSION = ['.ttf', '.otf', '.woff'] as const;

export const configureFonts = async () => {
    const c = getContext();

    // FONTS
    let fontsObj = 'export default [';

    const duplicateFontCheck: Array<string> = [];
    parseFonts((font, dir) => {
        if (!FONT_EXTENSION.some((ext) => font.includes(ext))) return;
        const keOriginal = font.split('.')[0];
        const keyNormalised = keOriginal.replaceAll('__', ' ');
        const includedFonts = getConfigProp('includedFonts');
        if (!includedFonts) return;
        if (!font || duplicateFontCheck.includes(font)) return;
        if (['*', keOriginal, keyNormalised].some((v) => includedFonts.includes(v))) {
            duplicateFontCheck.push(font);
            const fontSource = path.join(dir, font).replaceAll('\\', '\\\\');
            if (fsExistsSync(fontSource)) {
                fontsObj += `{
                              fontFamily: '${keyNormalised}',
                              file: require('${fontSource}'),
                          },`;
            } else {
                logWarning(`Font ${chalk.bold.white(fontSource)} doesn't exist! Skipping.`);
            }
        }
    });

    fontsObj += '];';
    mkdirSync(c.paths.project.assets.dir, { recursive: true });
    mkdirSync(c.paths.project.assets.runtimeDir, { recursive: true });
    const fontJsPath = path.join(c.paths.project.assets.dir, 'runtime', 'fonts.web.js');
    if (fsExistsSync(fontJsPath)) {
        const existingFileContents = fsReadFileSync(fontJsPath).toString();

        if (existingFileContents !== fontsObj) {
            logDebug('newFontsJsFile');
            fsWriteFileSync(fontJsPath, fontsObj);
        }
    } else {
        logDebug('newFontsJsFile');
        fsWriteFileSync(fontJsPath, fontsObj);
    }

    const templateFiles = path.resolve(__dirname, '..', 'templateFiles');
    copyFileSync(
        path.resolve(templateFiles, 'fontManager.js'),
        path.resolve(c.paths.project.assets.dir, 'runtime', 'fontManager.js')
    );
    copyFileSync(
        path.resolve(templateFiles, 'fontManager.js'),
        path.resolve(c.paths.project.assets.dir, 'runtime', 'fontManager.server.web.js')
    );
    copyFileSync(
        path.resolve(templateFiles, 'fontManager.web.js'),
        path.resolve(c.paths.project.assets.dir, 'runtime', 'fontManager.web.js')
    );

    return true;
};
