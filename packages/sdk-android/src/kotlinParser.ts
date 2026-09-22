import path from 'node:path';
import { type ConfigPluginPlatformSchema, getConfigProp, type OverridesOptions } from '@rnv/core';
import { addSystemInjects, getAppId, getEntryFile } from '@rnv/sdk-utils';
import { type Context, getContext } from './getContext';
import { createOverridesOption, writeParsedFiles } from './utils';

const TEMPLATE_DIR = 'app/src/main/java/rnv_template';

export const parseMainApplicationSync = () => {
    const c = getContext();
    if (!c.platform) return;

    const { pluginConfigAndroid } = c.payload;

    const injects: OverridesOptions = [
        createOverridesOption('{{APPLICATION_ID}}', getAppId()),
        createOverridesOption('{{ENTRY_FILE}}', getEntryFile() || ''),
        createOverridesOption('{{PLUGIN_IMPORTS}}', pluginConfigAndroid.pluginApplicationImports),
        createOverridesOption('{{PLUGIN_PACKAGES}}', pluginConfigAndroid.pluginPackages),
        createOverridesOption('{{PLUGIN_METHODS}}', pluginConfigAndroid.pluginApplicationMethods),
        createOverridesOption('{{RN_HOST_METHODS}}', pluginConfigAndroid.reactNativeHostMethods),
        createOverridesOption('{{PLUGIN_ON_CREATE}}', pluginConfigAndroid.pluginApplicationCreateMethods),
        createOverridesOption('{{PLUGIN_DEBUG_SERVER}}', pluginConfigAndroid.pluginApplicationDebugServer)
    ];

    addSystemInjects(injects);

    const mainApplication = path.join(TEMPLATE_DIR, 'MainApplication.kt');
    writeParsedFiles(mainApplication, injects, c);
};

export const parseMainActivitySync = () => {
    const c = getContext();
    const { pluginConfigAndroid } = c.payload;

    if (!pluginConfigAndroid.injectActivityOnCreate) {
        const { MainActivity_kt } = getConfigProp('templateAndroid') ?? {};
        pluginConfigAndroid.injectActivityOnCreate = MainActivity_kt?.onCreate || 'super.onCreate(savedInstanceState)';
    }

    const injects: OverridesOptions = [
        createOverridesOption('{{APPLICATION_ID}}', getAppId()),
        createOverridesOption('{{PLUGIN_ACTIVITY_IMPORTS}}', pluginConfigAndroid.pluginActivityImports),
        createOverridesOption('{{PLUGIN_ACTIVITY_METHODS}}', pluginConfigAndroid.pluginActivityMethods),
        createOverridesOption('{{PLUGIN_ON_CREATE}}', pluginConfigAndroid.pluginActivityCreateMethods),
        createOverridesOption('{{INJECT_ON_CREATE}}', pluginConfigAndroid.injectActivityOnCreate),
        createOverridesOption('{{PLUGIN_ON_ACTIVITY_RESULT}}', pluginConfigAndroid.pluginActivityResultMethods)
    ];
    addSystemInjects(injects);

    const mainActivity = path.join(TEMPLATE_DIR, 'MainActivity.kt');
    writeParsedFiles(mainActivity, injects, c);
};

export const parseSplashActivitySync = () => {
    const c = getContext();

    c.payload.pluginConfigAndroid.pluginSplashActivityImports += 'import androidx.appcompat.app.AppCompatActivity;\n';
    const injects: OverridesOptions = [
        createOverridesOption('{{APPLICATION_ID}}', getAppId()),
        createOverridesOption(
            '{{PLUGIN_SPLASH_ACTIVITY_IMPORTS}}',
            c.payload.pluginConfigAndroid.pluginSplashActivityImports
        )
    ];

    addSystemInjects(injects);

    const splashActivity = path.join(TEMPLATE_DIR, 'SplashActivity.kt');
    writeParsedFiles(splashActivity, injects, c);
};

export const injectPluginKotlinSync = (plugin: ConfigPluginPlatformSchema) => {
    const c = getContext();
    const { pluginConfigAndroid: pca } = c.payload;
    const { package: pkg, templateAndroid: templ } = plugin;
    const { MainActivity_kt: mainActivity, MainApplication_kt: mainApplication } = templ ?? {};

    if (mainActivity) {
        const { imports = [], methods, createMethods, resultMethods, onCreate = '' } = mainActivity;
        pca.pluginActivityImports += Array.from(new Set(imports))
            .flatMap((activityImport) =>
                pca.pluginActivityImports.includes(activityImport) ? [] : `import ${activityImport}\n`
            )
            .join('');
        pca.pluginActivityMethods += methods ? `\n${methods.join('\n    ')}` : '';
        pca.pluginActivityCreateMethods += createMethods ? `\n${createMethods.join('\n    ')}` : '';
        pca.pluginActivityResultMethods += resultMethods ? `\n${resultMethods.join('\n    ')}` : '';
        pca.injectActivityOnCreate = onCreate;
    }
    _injectPackage(c, plugin, pkg);

    if (!mainApplication) return;

    const { packages = [], createMethods, imports = [], methods } = mainApplication;
    for (const p of packages) {
        _injectPackage(c, plugin, p);
    }
    pca.pluginApplicationCreateMethods += createMethods ? `\n${createMethods.join('\n    ')}` : '';
    pca.pluginApplicationImports += Array.from(new Set(imports))
        .flatMap((appImport) => (pca.pluginApplicationImports.includes(appImport) ? [] : `import ${appImport}\n`))
        .join('');
    pca.pluginApplicationMethods += methods ? `\n${methods.join('\n    ')}` : '';
};

const _injectPackage = (c: Context, plugin: ConfigPluginPlatformSchema, pkg: string | undefined) => {
    if (!pkg || plugin?.forceLinking) return;
    c.payload.pluginConfigAndroid.pluginApplicationImports += `import ${pkg}\n`;

    const className = _extractClassName(pkg);
    if (!className) return;

    const mainApplication = plugin.templateAndroid?.MainApplication_kt;
    const packageParams = mainApplication?.packageParams?.join(',') || '';
    c.payload.pluginConfigAndroid.pluginPackages += `add(${className}(${packageParams}));\n`;
};

const _extractClassName = (pkg: string) => pkg?.split('.')?.pop();
