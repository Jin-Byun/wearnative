const path = require('node:path');
const {
    createRnvContext,
    loadWorkspacesConfigSync,
    loadDefaultConfigTemplates,
    updateRenativeConfigs,
    overrideTemplatePlugins,
    createRnvApi,
    getConfigProp,
    doResolve,
    logError,
    RnvFileName,
    fsExistsSync,
    fsMkdirSync,
    fsReadFileSync,
    removeDirSync,
    revertOverrideToOriginal
} = require('@rnv/core');

const Logger = require('@rnv/cli/lib/logger');
const RNV_HOME_DIR = path.join(__dirname, '..');

(async () => {
    try {
        createRnvApi({
            logger: Logger,
            getConfigProp,
            doResolve
        });
        createRnvContext({ RNV_HOME_DIR });

        loadWorkspacesConfigSync();
        loadDefaultConfigTemplates();
        await updateRenativeConfigs();
        await resetOverrides();

        await overrideTemplatePlugins();
    } catch (error) {
        logError(error);
    }
})();

const resetOverrides = async () => {
    const rnvDir = path.join(process.cwd(), '.rnv');
    fsMkdirSync(rnvDir, { recursive: true });

    const nodeModuleDir = path.join(process.cwd(), 'node_modules');
    const overrideDir = path.join(rnvDir, 'overrides');
    const appliedOverrideFilePath = path.join(overrideDir, RnvFileName.appliedOverride);
    try {
        const appliedOverrides = JSON.parse(fsReadFileSync(appliedOverrideFilePath).toString());
        for (const [moduleName, { version: appliedVersion, ...packageOverrides }] of Object.entries(appliedOverrides)) {
            const packageJsonPath = path.join(nodeModuleDir, moduleName, RnvFileName.package);

            if (!fsExistsSync(packageJsonPath)) continue;
            const { version: currentVersion } = JSON.parse(fsReadFileSync(packageJsonPath).toString());
            if (currentVersion !== appliedVersion) continue;

            for (const filePath of Object.keys(packageOverrides)) {
                const backupPath = path.join(overrideDir, moduleName, filePath);
                const destinationPath = path.join(nodeModuleDir, moduleName, filePath);
                revertOverrideToOriginal(destinationPath, backupPath);
            }
        }
        removeDirSync(overrideDir);
        return true;
    } catch {}
    return false;
};
