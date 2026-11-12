import path from 'node:path';
import {
    type ConfigFileApp,
    chalk,
    getContext,
    listAppConfigsFoldersSync,
    logInfo,
    RnvFileName,
    readObjectSync,
    writeFileSync
} from '@rnv/core';
import type { NewProjectData } from '../types';

const Question = async ({ inputs }: NewProjectData): Promise<void> => {
    const c = getContext();
    // Update appConfigs with new appTitle and appID
    const appConfigs = listAppConfigsFoldersSync(true);
    if (!appConfigs?.length) return;
    for (const appConfigID of appConfigs) {
        const appCnfPath = path.join(c.paths.project.appConfigsDir, appConfigID, RnvFileName.renative);
        const appConfig = readObjectSync<ConfigFileApp>(appCnfPath);
        if (!appConfig) continue;

        appConfig.common = appConfig.common || {};
        appConfig.common.title = inputs.appTitle;
        appConfig.common.id = inputs.appID;
        appConfig.common.description = `This is ${inputs.appTitle} app!`;
        logInfo(
            `Updating appConfig ${chalk.bold.white(appConfigID)} with title: ${chalk.bold.white(
                inputs.appTitle
            )} and id: ${chalk.bold.white(inputs.appID)}`
        );
        writeFileSync(appCnfPath, appConfig);
    }
};

export default Question;
