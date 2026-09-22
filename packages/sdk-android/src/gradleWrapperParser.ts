import path from 'node:path';
import {
    copyFolderContentsRecursiveSync,
    DEFAULTS,
    fsChmodSync,
    getAppFolder,
    getConfigProp,
    getContext,
    logDefault,
    RnvFolderName
} from '@rnv/core';
import { addSystemInjects } from '@rnv/sdk-utils';
import { createOverridesOption, writeParsedFiles } from './utils';

const GRADLE_SOURCE_PATH = path.join(__dirname, RnvFolderName.UP, RnvFolderName.templateFiles, 'gradleProject');

const copyGradleProjectTemplate = async () => {
    logDefault('copyGradleProjectTemplate');
    const appFolder = getAppFolder();

    copyFolderContentsRecursiveSync(GRADLE_SOURCE_PATH, appFolder);

    const gradlew = path.join(appFolder, 'gradlew');

    fsChmodSync(gradlew, '755');
};

export const parseGradleWrapperSync = () => {
    const c = getContext();
    logDefault('parseGradleWrapperSync');

    copyGradleProjectTemplate();

    c.payload.pluginConfigAndroid.gradleWrapperVersion =
        getConfigProp('gradleWrapperVersion') || DEFAULTS.gradleWrapperVersion;
    const injects = [
        createOverridesOption('{{INJECT_GRADLE_WRAPPER_VERSION}}', c.payload.pluginConfigAndroid.gradleWrapperVersion)
    ];
    addSystemInjects(injects);

    const wrapperProperties = 'gradle/wrapper/gradle-wrapper.properties';
    writeParsedFiles(wrapperProperties, injects, c, GRADLE_SOURCE_PATH);
};
