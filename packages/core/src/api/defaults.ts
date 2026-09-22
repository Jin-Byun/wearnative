import path from 'path';
import { getConfigProp } from '../context/contextProps';
import { fsExistsSync, fsReaddirSync, fsReadFileSync, fsWriteFileSync } from '../system/fs';
import { doResolve } from '../system/resolve';
import type { RnvApi } from './types';

const spinner: any = () => ({
    start: () => {
        //NOOP
    },
    fail: () => {
        //NOOP
    },
    succeed: () => {
        //NOOP
    },
    text: ''
});

const defaultLog: any = (v: string) => {
    console.log(`DEFAULT LOGGER: ${v}`);
};
const defaultGetString = () => '';
const defaultGetBool = () => false;

export const generateApiDefaults = (): RnvApi => ({
    isDefault: true,
    doResolve,
    getConfigProp: getConfigProp,
    logger: {
        printArrIntoBox: defaultLog,
        getCurrentCommand: defaultGetString,
        isInfoEnabled: defaultGetBool,
        logAndSave: defaultLog,
        chalk: defaultLog,
        logAppInfo: defaultLog,
        logDebug: defaultLog,
        logError: defaultLog,
        logExitTask: defaultLog,
        logHook: defaultLog,
        logInfo: defaultLog,
        logInitialize: defaultLog,
        logInitTask: defaultLog,
        logRaw: defaultLog,
        logSuccess: defaultLog,
        logSummary: defaultLog,
        logTask: defaultLog,
        logDefault: defaultLog,
        logToSummary: defaultLog,
        logWarning: defaultLog,
        logWelcome: defaultLog,
        printBoxEnd: defaultLog,
        printBoxStart: defaultLog,
        printIntoBox: defaultLog
    },
    prompt: {
        generateOptions() {
            //NOOP
            return {
                asString: '',
                keysAsArray: [],
                keysAsObject: {},
                optionsAsArray: [],
                valuesAsArray: [],
                valuesAsObject: {}
            };
        },
        inquirerPrompt: async () => {
            //NOOP
        },
        inquirerSeparator() {
            //NOOP
        }
    },
    spinner: spinner,
    fsExistsSync,
    fsReadFileSync,
    fsReaddirSync,
    fsWriteFileSync,
    path
});
