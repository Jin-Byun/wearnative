import path from 'node:path';
import {
    chalk,
    executeTask,
    fsExistsSync,
    getApi,
    getConfigProp,
    getContext,
    logDefault,
    logWarning,
    parseFonts,
    RnvTaskName
} from '@rnv/core';
import { confirmActiveBundler } from '@rnv/sdk-utils';

let keepRNVRunning = false;

export const startBundlerIfRequired = async (parentTaskName: string, originTaskName?: string) => {
    logDefault('startBundlerIfRequired');
    const bundleAssets = getConfigProp('bundleAssets');
    if (bundleAssets === true) return;

    const isRunning = await isBundlerActive();
    const resetCompleted = isRunning && (await confirmActiveBundler());
    if (isRunning && !resetCompleted) return;
    await executeTask({ taskName: RnvTaskName.start, parentTaskName, originTaskName });
    keepRNVRunning = true;
    await waitForBundler();
};

export const waitForBundlerIfRequired = async () => {
    const bundleAssets = getConfigProp('bundleAssets');
    if (bundleAssets === true) return;
    // return a new promise that does...nothing, just to keep RNV running while the bundler is running
    if (keepRNVRunning)
        return new Promise(() => {
            //Do nothing
        });
    return true;
};

const _isBundlerRunning = async () => {
    const c = getContext();

    logDefault('_isBundlerRunning');
    try {
        const response = await fetch(
            `http://${c.runtime.localhost}:${c.runtime.port}/${getConfigProp('entryFile')}.js`
        );
        const data = await response.text();
        if (data.includes('import')) {
            logDefault('_isBundlerRunning', '(YES)');
            return true;
        }
        logDefault('_isBundlerRunning', '(NO)');
        return false;
    } catch (_e) {
        logDefault('_isBundlerRunning', '(NO)');
        return false;
    }
};

export const isBundlerActive = async () => {
    const c = getContext();

    logDefault('isBundlerActive', `(http://${c.runtime.localhost}:${c.runtime.port})`);
    try {
        const res = await fetch(`http://${c.runtime.localhost}:${c.runtime.port}`);
        return res.ok;
    } catch (_e) {
        return false;
    }
};

const poll = (fn: () => Promise<boolean>, timeout = 30000, interval = 1000) => {
    const endTime = performance.now() + timeout;

    const spinner = getApi().spinner('Waiting for bundler to finish...').start('');
    const checkCondition = async (resolve: () => void, reject: (e: string) => void) => {
        try {
            const result = await fn();
            if (result) {
                spinner.succeed('');
                resolve();
            } else if (performance.now() < endTime) {
                setTimeout(checkCondition, interval, resolve, reject);
            } else {
                spinner.fail("Can't connect to bundler. Try restarting it.");
                reject("Can't connect to bundler. Try restarting it.");
            }
        } catch (e: unknown) {
            spinner.fail("Can't connect to bundler. Try restarting it.");
            if (typeof e === 'string') {
                reject(e);
            } else if (e instanceof Error) {
                reject(e.message);
            }
        }
    };

    return new Promise<void>(checkCondition);
};

export const configureFontSources = async () => {
    const c = getContext();
    const fontFolders = new Set<string>();
    const validFontExtensions = ['.ttf', '.otf'];
    parseFonts((font, dir) => {
        if (!validFontExtensions.some((ext) => font.includes(ext))) return;
        const key = font.split('.')[0];
        const includedFonts = getConfigProp('includedFonts');
        if (!includedFonts || !(includedFonts.includes('*') || includedFonts.includes(key))) return;
        const fontSource = path.join(dir, font);
        if (fsExistsSync(fontSource)) {
            // extract folder name from path
            const fontFolder = fontSource.split('/').slice(0, -1).join('/');
            fontFolders.add(fontFolder);
        } else {
            logWarning(`Font ${chalk.bold.white(fontSource)} doesn't exist! Skipping.`);
        }
    });

    // set it so react-native.config.js can pick it up
    c.paths.project.fontSourceDirs = Array.from(fontFolders);
};

export const waitForBundler = async () => poll(_isBundlerRunning);
