import path from 'node:path';
import { inquirerPrompt } from '../api';
import { getContext } from '../context/provider';
import { chalk, logDefault, logError, logInfo } from '../logger';
import type { ConfigFileTemplate } from '../schema/types';
import {
    copyFileSync,
    copyFolderContentsRecursiveSync,
    fsExistsSync,
    fsLstatSync,
    readObjectSync,
    writeFileSync
} from '../system/fs';
import { applyTemplate } from '../templates';
import type { RnvPlatform, RnvPlatformKey } from '../types';

export const checkAndUpdateProjectIfRequired = async () => {
    logDefault('checkAndUpdateIfRequired');
    const c = getContext();
    const { platform, buildConfig } = c;
    if (!platform || !buildConfig) return;
    if (buildConfig.isMonorepo || typeof platform === 'boolean') return true;

    await applyTemplate();

    if (!Object.hasOwn(buildConfig.platforms ?? {}, platform)) {
        logError(`Platform ${platform} is not supported!`);
        throw new Error(`Platform ${platform} is not supported!`);
    }

    const templateConfigFile = readObjectSync<ConfigFileTemplate>(c.paths.template.configTemplate);
    if (!templateConfigFile) return true;

    const missingFiles = _getMisFilesForPlatform({
        templateConfigFile,
        platform,
        projectPath: c.paths.project.dir,
        templatePath: c.paths.template.dir
    });
    const supportedPlatforms = c.files.project.config?.defaults?.supportedPlatforms;
    if (!missingFiles.length && supportedPlatforms?.includes(platform)) return true;

    const confirm = (await inquirerPrompt({
        type: 'confirm',
        message: `You are trying to run platform ${chalk.bold.magenta(
            platform
        )} which is not configured. Do you want to configure it now?`
    })) as boolean;
    if (!confirm) {
        throw new Error('Cancelled by user');
    }

    if (supportedPlatforms && !supportedPlatforms.includes(platform)) {
        supportedPlatforms.push(platform);
        if (c.files.project.config) {
            writeFileSync(c.paths.project.config, c.files.project.config);
        }
    }
    for (const mf of missingFiles) {
        const destPath = path.join(c.paths.project.dir, mf);
        const sourcePath = path.join(c.paths.template.dir, mf);
        if (fsExistsSync(destPath) || !fsExistsSync(sourcePath)) continue;

        try {
            if (fsLstatSync(sourcePath).isDirectory()) {
                logInfo(`Missing directory ${chalk.bold.white(destPath)}. COPYING from TEMPLATE...DONE`);
                copyFolderContentsRecursiveSync(sourcePath, destPath);
            } else {
                logInfo(`Missing file ${chalk.bold.white(destPath)}. COPYING from TEMPLATE...DONE`);
                copyFileSync(sourcePath, destPath);
            }
        } catch (e) {
            console.log(e);
        }
    }

    return true;
};

const _getMisFilesForPlatform = ({
    templateConfigFile,
    platform,
    projectPath,
    templatePath
}: {
    templateConfigFile: ConfigFileTemplate;
    platform: RnvPlatform;
    projectPath: string;
    templatePath: string;
}) => {
    const includedPaths = templateConfigFile.templateConfig?.includedPaths;

    return (
        includedPaths
            ?.filter((item) => typeof item !== 'string')
            .find((item) => item.platforms?.includes(platform as RnvPlatformKey))
            ?.paths.filter(
                (file) => !fsExistsSync(path.join(projectPath, file)) && fsExistsSync(path.join(templatePath, file))
            ) ?? []
    );
};
