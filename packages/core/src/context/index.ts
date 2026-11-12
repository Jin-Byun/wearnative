import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { RnvFileName } from '../enums/fileName';
import { RnvFolderName } from '../enums/folderName';
import { fsReadFileSync } from '../system/fs';
import { isSystemWin } from '../system/is';
import { generateContextDefaults } from './defaults';
import type { CreateContextOptions, RnvContext, RnvContextPathObj } from './types';

export const generateContextPaths = (pathObj: RnvContextPathObj, dir: string, configName?: string) => {
    pathObj.dir = dir;
    pathObj.config = path.join(dir, configName || RnvFileName.renative);
    pathObj.configLocal = path.join(dir, RnvFileName.renativeLocal);
    pathObj.configPrivate = path.join(dir, RnvFileName.renativePrivate);
    pathObj.appConfigsDir = path.join(dir, '..');
};

const populateLinkingInfo = (ctx: RnvContext) => {
    //TODO: find better way to deal with linking?
    ctx.paths.IS_LINKED = path.dirname(ctx.paths.rnv.dir).split(path.sep).pop() === 'packages';

    const npxLoc = isSystemWin ? '\\rnv\\bin\\index.js' : '/node_modules/.bin/rnv';
    const rnvPath = process.argv[1];
    const [rnvExecWorkspaceRoot] = rnvPath.split(npxLoc);

    ctx.paths.IS_NPX_MODE = path.join(ctx.paths.project.dir, 'node_modules').includes(rnvExecWorkspaceRoot);
};

export const createRnvContext = ({ RNV_HOME_DIR, ...ctxOpts }: CreateContextOptions) => {
    if (global.RNV_CONTEXT?.isInitialized) {
        // Handle direct initialize of context
        const msg =
            'This usually happens if you have multiple versions of @rnv/core dependencies located in your project or you are running project with global rnv (without npx).';
        throw new Error(`

FATAL: Multiple instances of @rnv/core detected:

1 (${global.RNV_CONTEXT.timeStart.toISOString()})
  ${global.RNV_CONTEXT.paths?.rnvCore?.dir || 'UNKNOWN (can happen if running older versions of RNV)'}
2 (${new Date().toISOString()})
  ${path.join(__dirname, '../..')}

${msg}
`);
    }

    const c: RnvContext = generateContextDefaults();
    c.isSystemWin = process.platform === 'win32';
    c.isSystemLinux = process.platform === 'linux';
    c.isSystemMac = process.platform === 'darwin';

    global.RNV_CONTEXT = Object.assign(c, ctxOpts) as RnvContext;

    populateContextPaths(c, RNV_HOME_DIR);
    populateContextPkgFiles(c);
};

export const populateContextPaths = (c: RnvContext, RNV_HOME_DIR: string | undefined) => {
    // user ------------------
    c.paths.user.homeDir = homedir();
    c.paths.user.currentDir = process.cwd();

    // @rnv/core ------------------
    c.paths.rnvCore.dir = path.join(__dirname, '../..');
    c.paths.rnvCore.templateFilesDir = path.join(c.paths.rnvCore.dir, RnvFolderName.templateFiles);
    c.paths.rnvCore.package = path.join(c.paths.rnvCore.dir, RnvFileName.package);

    // rnv ------------------
    if (RNV_HOME_DIR) {
        c.paths.rnv.dir = RNV_HOME_DIR;
        c.paths.rnv.package = path.join(RNV_HOME_DIR, RnvFileName.package);
    }

    // dotRnv ------------------
    c.paths.dotRnv.dir = path.join(c.paths.user.homeDir, '.rnv');
    mkdirSync(c.paths.dotRnv.dir, { recursive: true });
    c.paths.dotRnv.config = path.join(c.paths.dotRnv.dir, RnvFileName.renative);
    c.paths.dotRnv.configWorkspaces = path.join(c.paths.dotRnv.dir, RnvFileName.renativeWorkspaces);

    // workspace ------------------
    generateContextPaths(c.paths.workspace, c.paths.dotRnv.dir);

    // project ------------------
    generateContextPaths(c.paths.project, c.paths.user.currentDir, c.program.opts().configName);
    c.paths.project.builds.dir = path.join(c.paths.project.dir, 'platformBuilds');
    c.paths.project.nodeModulesDir = path.join(c.paths.project.dir, 'node_modules');
    c.paths.project.srcDir = path.join(c.paths.project.dir, 'src');
    c.paths.project.package = path.join(c.paths.project.dir, RnvFileName.package);
    c.paths.project.dotRnvDir = path.join(c.paths.project.dir, '.rnv');

    c.paths.buildHooks.dir = path.join(c.paths.project.dir, 'buildHooks');
    c.paths.buildHooks.tsconfig = path.join(c.paths.buildHooks.dir, 'tsconfig.json');
    c.paths.buildHooks.src.dir = path.join(c.paths.buildHooks.dir, 'src');
    c.paths.buildHooks.src.index = path.join(c.paths.buildHooks.src.dir, 'index.js');
    c.paths.buildHooks.src.indexTs = path.join(c.paths.buildHooks.src.dir, 'index.ts');
    c.paths.buildHooks.dist.dir = path.join(c.paths.buildHooks.dir, 'dist');
    c.paths.buildHooks.dist.index = path.join(c.paths.buildHooks.dist.dir, 'index.js');

    c.paths.project.appConfigsDir = path.join(c.paths.project.dir, 'appConfigs');
    c.paths.project.appConfigBase.dir = path.join(c.paths.project.appConfigsDir, 'base');
    c.paths.project.appConfigBase.pluginsDir = path.join(c.paths.project.appConfigBase.dir, 'plugins');
    c.paths.project.appConfigBase.fontsDir = path.join(c.paths.project.appConfigBase.dir, 'fonts');
    c.paths.project.appConfigBase.fontsDirs = [c.paths.project.appConfigBase.fontsDir];

    c.paths.project.assets.dir = path.join(c.paths.project.dir, 'platformAssets');
    c.paths.project.assets.runtimeDir = path.join(c.paths.project.assets.dir, 'runtime');
    c.paths.project.assets.config = path.join(c.paths.project.assets.dir, RnvFileName.renativeRuntime);

    // runtime
    c.platform = c.program.opts().platform;
    populateLinkingInfo(c);
};

export const populateContextPkgFiles = (c: RnvContext) => {
    // @rnv/core ------------------
    c.files.rnvCore.package = JSON.parse(fsReadFileSync(c.paths.rnvCore.package).toString());
    // rnv ------------------
    if (c.paths.rnv.package) {
        c.files.rnv.package = JSON.parse(fsReadFileSync(c.paths.rnv.package).toString());
    }
};
