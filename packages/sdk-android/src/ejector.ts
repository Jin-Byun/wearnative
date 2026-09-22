import path from 'node:path';
import {
    copyFileSync,
    copyFolderContentsRecursiveSync,
    doResolvePath,
    fsReadFileSync,
    fsWriteFileSync,
    getAppFolder,
    getConfigRootProp,
    getContext,
    parsePlugins,
    RnvFileName
} from '@rnv/core';

export const ejectGradleProject = async () => {
    const c = getContext();
    const isMonorepo = !!getConfigRootProp('isMonorepo');
    const monoRoot = isMonorepo && (getConfigRootProp('monoRoot') || '../..');
    const rootMonoProjectPath = path.join(c.paths.project.dir, monoRoot || '').replaceAll('\\', '/');

    const appFolder = path.join(getAppFolder(), '..');
    const pathNmMatch = `${path.join(rootMonoProjectPath, 'node_modules')}/`.replaceAll('\\', '/');
    const pathRnMatch = `${path.join(pathNmMatch, 'react-native')}/`.replaceAll('\\', '/');
    const pathNmReplace = '../node_modules/';
    const pathRnReplace = '../node_modules/react-native/';
    //= ==========
    // settings.gradle
    //= ==========
    const settingsGradlePath = path.join(appFolder, 'android', 'settings.gradle');
    try {
        const setGradleAsString = fsReadFileSync(settingsGradlePath).toString();

        const packagesPathMatch = new RegExp(
            `${path
                .join(rootMonoProjectPath, 'packages')
                .replaceAll('\\', '/')
                .replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}/.+?/node_modules/`,
            'g'
        );

        const sanitised = setGradleAsString
            .replaceAll(pathRnMatch, pathRnReplace)
            .replaceAll(pathNmMatch, pathNmReplace)
            .replaceAll(packagesPathMatch, pathNmReplace);

        fsWriteFileSync(settingsGradlePath, sanitised);
    } catch {}

    //= ==========
    // keystore.properties
    //= ==========
    const keystorePropPath = path.join(appFolder, 'android', 'keystore.properties');

    try {
        const objAsString = fsReadFileSync(keystorePropPath).toString();
        const objAsArr = objAsString.split('\n');
        if (objAsArr.length) {
            const sanitised = `
          ${objAsArr.map((v) => (v.includes('storeFile=') ? 'storeFile=release.keystore' : v)).join('\n')}`;
            fsWriteFileSync(keystorePropPath, sanitised);
        }
    } catch {}

    //= ==========
    // build.gradle
    //= ==========
    const buildGradlePath = path.join(appFolder, 'android', 'build.gradle');

    try {
        const buildGradleAsString = fsReadFileSync(buildGradlePath).toString();
        // biome-ignore lint/suspicious/noTemplateCurlyInString: for build.gradle
        const rootDirTemplate = '${project.rootDir}';
        // biome-ignore lint/suspicious/noTemplateCurlyInString: for build.gradle
        const getRootDirTemplate = '${project.getRootDir()}';

        const match1 = `"${rootDirTemplate}/../../../../node_modules/react-native-v8/dist"`;
        const replace1 = `= uri("${getRootDirTemplate}/../node_modules/react-native-v8/dist")`;

        const match2 = `url("${rootMonoProjectPath}/node_modules/react-native-v8/dist")`;
        const replace2 = `url = uri("${getRootDirTemplate}/../node_modules/react-native-v8/dist")`;

        const match3 = `url("${rootMonoProjectPath}/node_modules/v8-android/dist")`;
        const replace3 = `url = uri("${getRootDirTemplate}/../node_modules/v8-android/dist")`;

        const sanitised = buildGradleAsString
            .replaceAll(match2, replace2)
            .replaceAll(match3, replace3)
            .replaceAll(pathRnMatch, pathRnReplace)
            .replaceAll(pathNmMatch, pathNmReplace)
            .replaceAll(match1, replace1);

        fsWriteFileSync(buildGradlePath, sanitised);
    } catch {}

    //= ==========
    // Plugins
    //= ==========
    const afterEvaluateFix: Array<{ match: string; replace: string }> = [];
    const extensionsFilter = [
        '.java',
        '.gradle',
        'gradle.properties',
        '.xml',
        '.png',
        'eventtusicons',
        'emojioneandroid',
        '.jar',
        '.kt'
    ];

    parsePlugins((_plugin, pluginPlat, key: string) => {
        const pluginPath = doResolvePath(key);
        if (!pluginPath) return;

        if (pluginPlat.templateAndroid?.app_build_gradle?.afterEvaluate) {
            afterEvaluateFix.push(
                ...pluginPlat.templateAndroid.app_build_gradle.afterEvaluate.map((v) => ({
                    match: v.replace('{{PLUGIN_ROOT}}', pluginPath),
                    replace: v.replace('{{PLUGIN_ROOT}}', `../../node_modules/${key}`)
                }))
            );
        }

        const destPath = path.join(appFolder, 'node_modules', key);
        copyFolderContentsRecursiveSync(
            pluginPath,
            destPath,
            false,
            undefined,
            false,
            undefined,
            undefined,
            c,
            extensionsFilter
        );
        copyFileSync(path.join(pluginPath, RnvFileName.package), path.join(destPath, RnvFileName.package));
    });

    //= ==========
    // app/build.gradle
    //= ==========
    const appBuildGradlePath = path.join(appFolder, 'android/app', 'build.gradle');
    try {
        const setGradleAsString = fsReadFileSync(appBuildGradlePath).toString();

        const match1 = 'root: "../../../"';
        const replace1 = 'root: "../.."';

        const match2 = 'cliPath: "node_modules/react-native/cli.js",';
        const replace2 = '';

        const packagesPathMatch = new RegExp(
            `${path.join(rootMonoProjectPath, 'packages').replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}/.+?/node_modules/`,
            'g'
        );

        const sanitised = setGradleAsString
            .replaceAll(pathRnMatch, `../${pathRnReplace}`)
            .replaceAll(pathNmMatch, `../${pathNmReplace}`)
            .replaceAll(match1, replace1)
            .replaceAll(match2, replace2)
            .replaceAll(packagesPathMatch, pathNmReplace);

        fsWriteFileSync(appBuildGradlePath, sanitised);
    } catch {}
};
