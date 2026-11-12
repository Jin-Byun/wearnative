import path from 'node:path';
import { getContext } from '../context/provider';
import { RnvFileName } from '../enums/fileName';
import { logDefault, logWarning } from '../logger';
import type { ConfigFileApp } from '../schema/types';
import { fsExistsSync, fsLstatSync, fsReaddirSync, readObjectSync } from '../system/fs';

const IGNORE_FOLDER = '.git';

export const listAppConfigsFoldersSync = (ignoreHiddenConfigs: boolean, appConfigsDirPath?: string) => {
    logDefault('listAppConfigsFoldersSync', `ignoreHiddenConfigs:${!!ignoreHiddenConfigs}`);
    const c = getContext();
    if (!c.paths?.project) return [];

    const dirPath = appConfigsDirPath || c.paths.project.appConfigsDir;
    if (!fsExistsSync(dirPath)) return [];

    const appConfigsDirs: Array<string> = fsReaddirSync(dirPath).flatMap((dir) => {
        const appConfigDir = path.join(dirPath, dir);
        if (dir === IGNORE_FOLDER || !fsLstatSync(appConfigDir).isDirectory()) return [];
        if (!ignoreHiddenConfigs) return dir;
        const appConfig = path.join(appConfigDir, RnvFileName.renative);
        try {
            if (readObjectSync<ConfigFileApp>(appConfig)?.hidden !== true) return dir;
        } catch (e) {
            logWarning(`_listAppConfigsFoldersSync: ${e}`);
        }
        return [];
    });
    return appConfigsDirs;
};
