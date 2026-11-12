import path from 'node:path';
import { build } from 'esbuild';
import { inquirerPrompt } from '../api';
import { getConfigRootProp } from '../context/contextProps';
import { getContext } from '../context/provider';
import { RnvFolderName } from '../enums/folderName';
import { logDebug, logError, logHook, logInfo } from '../logger';
import { copyFolderContentsRecursiveSync, fsExistsSync } from '../system/fs';

export const executePipe = async (key: string) => {
    const c = getContext();
    logDebug('executePipe', c?.program?.opts()?.json ? key : `('${key}')`);

    await buildHooks();
    const pipes = c.buildPipes?.[key] ?? null;
    if (!Array.isArray(pipes)) {
        logError(`buildPipes is not an Array!`);
        return;
    }
    for (const next of pipes) {
        logHook(`buildHook.${next?.name}`, '(EXECUTING)');
        await next(c);
    }
};

export const buildHooks = async () => {
    logDebug('buildHooks');
    const c = getContext();
    const hasNoIndexTs = !fsExistsSync(c.paths.buildHooks.src.indexTs);
    const hasNoIndex = !fsExistsSync(c.paths.buildHooks.src.index);

    if (hasNoIndex && hasNoIndexTs && c.program.opts().ci) {
        c.runtime.skipBuildHooks = true;
    }
    if (c.runtime.skipBuildHooks) {
        logInfo('No build hooks found and in --ci mode. SKIPPING');
        return;
    }

    const enableHookRebuild = getConfigRootProp('enableHookRebuild');
    const { reset, resetHard, resetAssets, hooks } = c.program.opts();
    let shouldBuildHook =
        reset ||
        resetHard ||
        resetAssets ||
        hooks ||
        !fsExistsSync(c.paths.buildHooks.dist.dir) ||
        enableHookRebuild === true ||
        c.runtime.forceBuildHookRebuild;

    if (hasNoIndex && hasNoIndexTs) {
        if (!c.program.opts().yes) {
            const confirm = (await inquirerPrompt({
                type: 'confirm',
                name: 'confirm',
                message: 'Build hooks not configured in this project. Configure?'
            })) as boolean;
            if (!confirm) {
                c.runtime.skipBuildHooks = true;
                return;
            }
        }

        let buildHooksSource = path.join(c.paths.template.dir, RnvFolderName.buildHooks, 'src');
        // if there is a template and has buildhooks folder, use that instead of the default
        if (fsExistsSync(buildHooksSource)) {
            shouldBuildHook = true;
        } else {
            buildHooksSource = path.join(c.paths.rnvCore.templateFilesDir, 'buildHooksSrc');
        }
        copyFolderContentsRecursiveSync(buildHooksSource, c.paths.buildHooks.src.dir);
    }

    if (shouldBuildHook && !c.isBuildHooksReady) {
        const indexPath = hasNoIndexTs ? c.paths.buildHooks.src.index : c.paths.buildHooks.src.indexTs;
        try {
            logInfo('Build hooks not complied. BUILDING...');

            await build({
                entryPoints: [indexPath],
                bundle: true,
                platform: 'node',
                logLimit: c.program.opts().json ? 0 : 10,
                external: [
                    '@rnv/core' // exclude rnv core from build
                ].concat(
                    Object.keys(c.files.project.package.dependencies || {}),
                    Object.keys(c.files.project.package.devDependencies || {})
                ), // exclude everything that's present in node_modules
                outfile: `${c.paths.buildHooks.dist.dir}/index.js`
            });
        } catch (e) {
            // Fail Builds instead of warn when hook fails
            throw new Error(`BUILD_HOOK Failed with error: ${e}`);
        }
        c.isBuildHooksReady = true;
    }

    const h = require(c.paths.buildHooks.dist.index);
    c.buildHooks = h.hooks;
    c.buildPipes = h.pipes;

    return;
};
