import type { PathLike } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import merge from 'deepmerge';
import lGet from 'lodash/get';
import ncp from 'ncp';
import { rimraf, rimrafSync } from 'rimraf';
import shelljs from 'shelljs';
import { getApi } from '../api/provider';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { chalk, logDebug, logError, logInfo, logWarning } from '../logger';
import type { ConfigPropKey } from '../schema/types';
import { matchRegEx } from './regEx';
import type { FileUtilsPropConfig, OverridesOptions, TimestampPathsConfig } from './types';

const objIsString = (obj: string | object): obj is string => typeof obj === 'string';

export const fsWriteFileSync = (dest: string | undefined, data: string, options?: fs.WriteFileOptions) => {
    if (!dest) return;
    fs.writeFileSync(dest, data, options);
};

export const fsCopyFileSync = (source: string, dest: string) => {
    // console.log('FS_COPY', source);
    fs.copyFileSync(source, dest);
};

export const fsExistsSync = (dest: PathLike | undefined) => fs.existsSync(dest as PathLike);
export const fsExistsAsync = async (dest: PathLike | undefined) => {
    try {
        await fs.promises.access(dest as PathLike, fs.constants.F_OK);
        return dest as PathLike;
    } catch (_err) {
        return '';
    }
};

export const fsReaddirSync = (dest: PathLike | undefined) => fs.readdirSync(dest as PathLike);

export const fsLstatSync = (dest: PathLike | undefined) => fs.lstatSync(dest as PathLike);

export const fsReadFileSync = (dest: PathLike | undefined) => fs.readFileSync(dest as PathLike);

export const fsChmodSync = (dest: PathLike | undefined, flag: fs.Mode) => fs.chmodSync(dest as PathLike, flag);

export const fsRenameSync = (arg1: PathLike | undefined, arg2: PathLike) => {
    // One of the paths does not exist
    if (!arg1 || !arg2) return logError(`Cannot rename file. source path doesn't exist: ${!arg1 ? arg1 : arg2}`);

    // If it's a directory, on Windows all files within need to be copied over, simple renaming
    // will cause a permitions error
    if (fs.lstatSync(arg1).isDirectory()) {
        fs.cpSync(arg1 as string, arg2 as string, { recursive: true });
        fs.rmdirSync(arg1, { recursive: true });
        return;
    }
    return fs.renameSync(arg1, arg2);
};

export const fsStatSync = (arg1: PathLike | undefined) => fs.statSync(arg1 as PathLike);

export const fsMkdirSync = (arg1: PathLike | undefined) => fs.mkdirSync(arg1 as PathLike);

export const fsUnlinkSync = (arg1: PathLike | undefined) => fs.unlinkSync(arg1 as PathLike);

export const fsSymlinkSync = (arg1: PathLike | undefined, arg2: PathLike) => {
    fs.symlinkSync(arg1 as PathLike, arg2);
};

export const fsReadFile = (arg1: PathLike, arg2: (err: unknown, data: Buffer) => void) => {
    fs.readFile(arg1, arg2);
};

export const fsReaddir = (arg1: PathLike, arg2: (err: unknown, files: string[]) => void) => fs.readdir(arg1, arg2);

const _getSanitizedPath = (origPath: string, timestampPathsConfig?: TimestampPathsConfig) => {
    if (
        !timestampPathsConfig?.paths?.length ||
        !timestampPathsConfig.timestamp ||
        !timestampPathsConfig.paths.includes(origPath)
    ) {
        return origPath;
    }
    const ext = path.extname(origPath);
    const fileName = path.basename(origPath, ext);
    const dirPath = path.dirname(origPath);
    const newPath = path.join(dirPath, `${fileName}-${timestampPathsConfig.timestamp}${ext}`);
    return newPath;
};

export const copyFileSync = (
    source: string | undefined,
    target: string | undefined,
    skipOverride?: boolean,
    timestampPathsConfig?: TimestampPathsConfig
) => {
    if (!target) return;
    if (!source) return;
    logDebug('copyFileSync', source);
    let targetFile = target;
    // if target is a directory a new file with the same name will be created
    if (source.indexOf('.DS_Store') !== -1) return;

    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isDirectory()) {
            targetFile = path.join(target, path.basename(source));
        }
    }
    if (fs.existsSync(targetFile)) {
        if (skipOverride) return;
        const src = fs.readFileSync(source);
        const dst = fs.readFileSync(targetFile);

        if (Buffer.compare(src, dst) === 0) return;
    }
    logDebug('copyFileSync', source, targetFile, 'executed');
    try {
        fsCopyFileSync(source, _getSanitizedPath(targetFile, timestampPathsConfig));
    } catch (e) {
        logDebug('copyFileSync', e);
    }
};

const SKIP_INJECT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.svg', '.jar', '.zip', '.ico'];
export const writeCleanFile = (
    source: string,
    destination: string,
    overrides?: OverridesOptions,
    timestampPathsConfig?: TimestampPathsConfig,
    c?: RnvContext
) => {
    if (!fs.existsSync(source)) {
        logError(`Cannot write file. source path doesn't exist: ${source}`);
        return;
    }
    if (!fs.existsSync(destination)) {
        logDebug(`destination path doesn't exist: ${destination}. will create new one`);
    }
    const api = getApi();
    const ext = path.extname(source);
    if (SKIP_INJECT_EXTENSIONS.includes(ext)) {
        fsCopyFileSync(source, _getSanitizedPath(destination, timestampPathsConfig));
        return;
    }
    let pFile = fs.readFileSync(source, 'utf8');
    if (/\ufffd/.test(pFile) === true) {
        // Handle uncaught binary files
        fsCopyFileSync(source, _getSanitizedPath(destination, timestampPathsConfig));
        return;
    }
    for (const { override, pattern } of overrides ?? []) {
        if (override === undefined) continue;
        const reOverride = new RegExp(pattern, 'g');
        pFile = pFile.replace(reOverride, String(override));
    }
    if (c) {
        const reConfigProp = /{{configProps\.([\s\S]*?)}}/g;
        pFile = pFile.replace(reConfigProp, (_, key: ConfigPropKey) => api.getConfigProp(key) || '');
    }
    fsWriteFileSync(_getSanitizedPath(destination, timestampPathsConfig), pFile, 'utf8');
};

export const readCleanFile = (source: string, overrides?: OverridesOptions) => {
    // logDefault(`writeCleanFile`)
    // console.log('readCleanFile', source);
    if (!fs.existsSync(source)) {
        logError(`Cannot read file. source path doesn't exist: ${source}`);
        return;
    }

    const pFile = fs.readFileSync(source, 'utf8');
    let pFileClean = pFile;
    if (overrides?.forEach) {
        overrides.forEach((v) => {
            if (v.override) {
                const regEx = new RegExp(v.pattern, 'g');
                if (typeof v.override === 'number') {
                    pFileClean = pFileClean.replace(regEx, v.override.toString());
                } else {
                    pFileClean = pFileClean.replace(regEx, v.override);
                }
            }
        });
    }

    return Buffer.from(pFileClean, 'utf8');
};

export const copyFileWithInjectSync = (
    source: string,
    target: string,
    skipOverride?: boolean,
    injectObject?: OverridesOptions,
    timestampPathsConfig?: TimestampPathsConfig,
    c?: RnvContext
) => {
    logDebug('copyFileWithInjectSync', source);

    let targetFile = target;
    // if target is a directory a new file with the same name will be created
    if (source.indexOf('.DS_Store') !== -1) return;

    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isDirectory()) {
            targetFile = path.join(target, path.basename(source));
        }
    }
    if (fs.existsSync(targetFile)) {
        if (skipOverride) return;
        const src = readCleanFile(source, injectObject);
        const dst = fs.readFileSync(targetFile);

        if (src && Buffer.compare(src, dst) === 0) return;
    }
    logDebug('copyFileSync', source, targetFile, 'executed');

    try {
        writeCleanFile(source, targetFile, injectObject, timestampPathsConfig, c);
    } catch (e) {
        logDebug('copyFileSync', e);
    }
};

// export const invalidatePodsChecksum = () => {
//     const c = getContext();
//     const appFolder = path.join(c.paths.project.builds.dir, `${c.runtime.appId}_${c.platform}`);
//     const podChecksumPath = path.join(appFolder, 'Podfile.checksum');
//     if (fs.existsSync(podChecksumPath)) {
//         fs.unlinkSync(podChecksumPath);
//     }
// };

export const copyFolderRecursiveSync = (
    source: string,
    target: string,
    convertSvg = true,
    skipOverride?: boolean,
    injectObject?: OverridesOptions,
    timestampPathsConfig?: TimestampPathsConfig,
    c?: RnvContext,
    extFilter?: Array<string>
) => {
    logDebug('copyFolderRecursiveSync', source, target);
    if (!fs.existsSync(source)) return;

    let files = [];
    // check if folder needs to be created or integrated
    const targetFolder = path.join(target, path.basename(source));
    if (!fs.existsSync(targetFolder)) {
        mkdirSync(targetFolder);
    }
    // copy
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach((file) => {
            const curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(
                    curSource,
                    targetFolder,
                    convertSvg,
                    skipOverride,
                    injectObject,
                    timestampPathsConfig,
                    c,
                    extFilter
                );
            } else if (path.extname(curSource) === '.svg' && convertSvg === true) {
                const jsDest = path.join(targetFolder, `${path.basename(curSource)}.js`);
                logDebug(`file ${curSource} is svg and convertSvg is set to true. converting to ${jsDest}`);
                saveAsJs(curSource, jsDest);
            } else if (injectObject !== null) {
                copyFileWithInjectSync(curSource, targetFolder, skipOverride, injectObject, timestampPathsConfig, c);
            } else if (extFilter && extFilter?.length > 0) {
                if (extFilter.includes(path.extname(curSource)) || extFilter.includes(path.basename(curSource))) {
                    copyFileSync(curSource, targetFolder, skipOverride, timestampPathsConfig);
                }
            } else {
                copyFileSync(curSource, targetFolder, skipOverride, timestampPathsConfig);
            }
        });
    }
};

export const copyFolderContentsRecursiveSync = (
    source: string | null | undefined,
    target: string | null | undefined,
    convertSvg = true,
    skipPaths?: Array<string>,
    skipOverride = false,
    injectObject?: OverridesOptions,
    timestampPathsConfig?: TimestampPathsConfig,
    c?: RnvContext,
    extFilter?: Array<string>
) => {
    logDebug('copyFolderContentsRecursiveSync', source, target, skipPaths);
    if (!source || !target || !fs.existsSync(source)) return;

    const targetFolder = path.join(target);
    if (!fs.existsSync(targetFolder)) {
        mkdirSync(targetFolder);
    }
    if (!fs.lstatSync(source).isDirectory()) return;

    const files = fs.readdirSync(source);
    for (const file of files) {
        const curSource = path.join(source, file);
        if (skipPaths?.includes(curSource)) continue;
        switch (true) {
            case fs.lstatSync(curSource).isDirectory():
                copyFolderRecursiveSync(
                    curSource,
                    targetFolder,
                    convertSvg,
                    skipOverride,
                    injectObject,
                    timestampPathsConfig,
                    c,
                    extFilter
                );
                break;
            case injectObject !== null:
                copyFileWithInjectSync(curSource, targetFolder, skipOverride, injectObject, timestampPathsConfig, c);
                break;
            case path.extname(curSource) === '.svg' && convertSvg: {
                const jsDest = path.join(targetFolder, `${path.basename(curSource)}.js`);
                logDebug(`file ${curSource} is svg and convertSvg is set to true. converting to ${jsDest}`);
                saveAsJs(curSource, jsDest);
                break;
            }
            // biome-ignore lint/suspicious/noFallthroughSwitchClause: If extFilter includes curSource, copyFile.
            case !!extFilter?.length:
                if (!extFilter.some((v) => v === path.extname(curSource) || v === path.basename(curSource))) break;
            default:
                copyFileSync(curSource, targetFolder, skipOverride, timestampPathsConfig);
        }
    }
};

export const copyFolderContentsRecursive = (source: string, target: string, convertSvg = true, skipPaths?: boolean) =>
    new Promise<void>((resolve, reject) => {
        logDebug('copyFolderContentsRecursive', source, target, skipPaths, convertSvg);
        if (!fs.existsSync(source)) return;
        const targetFolder = path.resolve(target);
        if (!fs.existsSync(targetFolder)) {
            mkdirSync(targetFolder);
        }
        ncp(source, targetFolder, (err) => {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
    });

export const saveAsJs = (source: string, dest: string) => {
    const svgData = fsReadFileSync(source);
    const dataString = `module.exports = \`${svgData.toString()}\`\n`;
    writeFileSync(dest, dataString);
};

export const mkdirSync = (dir: string) => {
    if (!dir) return;
    if (fs.existsSync(dir)) return;
    try {
        shelljs.mkdir('-p', dir);
    } catch (e) {
        logWarning(`shelljs.mkdir failed for dir: ${dir} with error: ${e}`);
    }
};

export const cleanFolder = async (d: string) => {
    logDebug('cleanFolder', d);
    try {
        await rimraf(d);
    } catch (_e) {}
    mkdirSync(d);
};

export const removeFilesSync = (filePaths: Array<string>) => {
    logDebug('removeFilesSync', filePaths);
    filePaths.forEach((filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            } else {
                logDebug(`Path ${filePath} does not exist`);
            }
        } catch (e) {
            logError(e);
        }
    });
};

export const removeDirsSync = (dirPaths: Array<string>) => {
    logDebug('removeDirsSync', dirPaths);

    for (let i = 0; i < dirPaths.length; i++) {
        try {
            removeDirSync(dirPaths[i]);
        } catch (e) {
            logError(e);
        }
    }
};

export const removeDirs = async (dirPaths: Array<string>) => {
    logDebug('removeDirs', dirPaths);
    await Promise.all(
        dirPaths.map(async (p) => {
            try {
                await rimraf(p);
            } catch (e) {
                logError(e);
            }
        })
    );
};

export const removeDirSync = (dir: string, rmSelf = true) => {
    if (rmSelf) {
        try {
            rimrafSync(dir);
        } catch (e) {
            logDebug(`rimraf error:${e}`);
        }
        return;
    }
    let files: string[];
    try {
        files = fs.readdirSync(dir);
    } catch (_e) {
        logDebug('!Oops, directory not exist.');
        return;
    }
    for (const file of files) {
        try {
            rimrafSync(file);
        } catch (e) {
            logDebug(`rimraf error:${e}`);
        }
    }
};

export const writeFileSync = (filePath: string | undefined, obj: string | object, spaces = 4, addNewLine = true) => {
    if (!filePath) return;
    const invalidPath = ['?', 'undefined'];
    if (invalidPath.some((p) => filePath.includes(p))) return;
    logDebug('writeFileSync', filePath);
    const output = objIsString(obj) ? obj : `${JSON.stringify(obj, null, spaces)}${addNewLine ? '\n' : ''}`;
    try {
        if (fs.readFileSync(filePath).toString() === output) return;
    } catch {}
    logDebug('writeFileSync', filePath, 'executed', `size:${output.length}`);
    fsWriteFileSync(filePath, output);
    return output;
};

export const writeObjectSync = (filePath: string, obj: string | object, spaces: number, addNewLine = true) => {
    logDebug('writeObjectSync', filePath);
    logWarning('writeObjectSync is DEPRECATED. use writeFileSync instead');
    return writeFileSync(filePath, obj, spaces, addNewLine);
};

export const readObjectSync = <T = object>(filePath?: string, sanitize?: boolean, c?: RnvContext) => {
    if (!filePath) {
        logDebug('readObjectSync: filePath is undefined');
        return null;
    }
    if (!fs.existsSync(filePath)) {
        logDebug(`readObjectSync: File at ${filePath} does not exist`);
        return null;
    }
    logDebug(`readObjectSync:${sanitize}:${filePath}`);
    let obj: any;
    try {
        obj = JSON.parse(fs.readFileSync(filePath).toString());
        if (sanitize) {
            logDebug(`readObjectSync: will sanitize file at: ${filePath}`);
            if (c) {
                obj = sanitizeDynamicRefs<T>(c, obj);
            }
            if (obj._refs) {
                obj = sanitizeDynamicProps(obj, {
                    files: c?.files,
                    runtimeProps: c?.runtime,
                    props: obj._refs,
                    configProps: c?.injectableConfigProps
                });
            }
        }
    } catch (e) {
        logError(`readObjectSync: Parsing of ${chalk.bold.white(filePath)} failed with ${e}`);
        return null;
    }
    return obj as T;
};

export const updateObjectSync = (filePath: string, updateObj: object) => {
    const obj = readObjectSync(filePath);
    const output = obj ? (merge(obj, updateObj) as object) : updateObj;
    writeFileSync(filePath, output);
    return output;
};

export const getRealPath = (p: string | undefined, key = 'undefined', original?: string) => {
    if (!p) {
        if (original) {
            logDebug(`Path ${chalk.bold.white(key)} is not defined. using default: ${chalk.bold.white(original)}`);
        }
        return original;
    }
    const c = getContext();
    if (p.startsWith('./')) {
        return path.join(c.paths.project.dir, p);
    }
    const output = p
        // TODO: deprecate this path
        .replace(/\$RNV_HOME/g, c.paths.rnv.dir)
        .replace(/~/g, c.paths.user.homeDir)
        .replace(/\$USER_HOME/g, c.paths.user.homeDir)
        .replace(/\$PROJECT_HOME/g, c.paths.project.dir)
        .replace(/\$WORKSPACE_HOME/g, c.paths.workspace.dir)
        // TODO: deprecate this path
        .replace(/RNV_HOME/g, c.paths.rnv.dir)
        .replace(/USER_HOME/g, c.paths.user.homeDir)
        .replace(/PROJECT_HOME/g, c.paths.project.dir);
    return output;
};

const _refToValue = (ref: string, key: string) => {
    // ref=> '$REF$:./my/path/to/file.json$...prop.subProp'
    const val = ref.replace('$REF$:', '').split('$...');
    // val=> ['./my/path/to/file.json', 'prop.subProp']
    const realPath = getRealPath(val[0], key);

    if (realPath?.includes('.json') && val.length === 2) {
        if (fs.existsSync(realPath)) {
            const obj = readObjectSync(realPath);
            const valPath = val[1]; // valPath=> 'prop.subProp'
            const output = lGet(obj, valPath);
            return output;
        } else {
            logWarning(`_refToValue: ${chalk.bold.white(realPath)} does not exist!`);
        }
    }
    return ref;
};

export const arrayMerge = (destinationArray: Array<string>, sourceArray: Array<string>) => {
    const jointArray = destinationArray.concat(sourceArray);
    const uniqueArray = jointArray.filter((item, index) => jointArray.indexOf(item) === index);
    return uniqueArray;
};

const _arrayMergeOverride = (_destinationArray: Array<string>, sourceArray: Array<string>) => sourceArray;

export const sanitizeDynamicRefs = <T = unknown>(c: RnvContext, obj: T) => {
    if (!obj) return obj;
    if (Array.isArray(obj)) {
        for (const v of obj) {
            sanitizeDynamicRefs(c, v);
        }
        return obj;
    }
    if (typeof obj === 'object') {
        for (const v of Object.keys(obj)) {
            const key = v as keyof T;
            const val = obj[key];
            if (!val) continue;
            if (objIsString(val) && val.startsWith('$REF$:')) {
                obj[key] = _refToValue(val, v);
                continue;
            }
            if (Array.isArray(val) || typeof val === 'object') {
                sanitizeDynamicRefs(c, val);
            }
        }
    }
    return obj;
};

export const resolvePackage = (text: string) => {
    const api = getApi();
    if (typeof text !== 'string') return text;
    const regEx = /{{resolvePackage\(([\s\S]*?)\)}}/g;
    const matches = matchRegEx(text, regEx);
    let newText = text;
    if (matches?.length) {
        matches.forEach((match) => {
            const val = match.replace('{{resolvePackage(', '').replace(')}}', '');
            // TODO: Figure out WIN vs LINUX treatment here
            // forceForwardPaths is required for WIN Android to work correctly
            newText = newText.replace(match, api.doResolve(val, false, { forceForwardPaths: true }) as string);
        });
    }
    return newText;
};

export const sanitizeDynamicProps = <T = unknown>(obj: T, propConfig: FileUtilsPropConfig): T => {
    if (!obj) return obj;
    if (objIsString(obj)) return resolvePackage(obj) as T;
    if (Array.isArray(obj)) {
        obj.forEach((v, i) => {
            if (objIsString(v)) {
                _bindStringVals(obj, v, i, propConfig);
            } else {
                sanitizeDynamicProps(v, propConfig);
            }
        });
        return obj;
    }
    if (typeof obj === 'object') {
        Object.keys(obj).forEach((key) => {
            const val = obj[key as keyof T];
            const newKey = resolvePackage(key) as keyof T;
            delete obj[key as keyof T];
            obj[newKey] = val;
            if (val) {
                if (typeof val === 'string') {
                    _bindStringVals(obj, val, newKey, propConfig);
                } else {
                    sanitizeDynamicProps(val, propConfig);
                }
            }
        });
    }
    return obj;
};

const BIND_FILES = '{{files.';
const BIND_PROPS = '{{props.';
const BIND_CONFIG_PROPS = '{{configProps.';
const BIND_RUNTIME_PROPS = '{{runtimeProps.';
const BIND_ENV = '{{env.';

const _bindStringVals = <T, K extends keyof T>(
    obj: T,
    val: string,
    newKey: K,
    { props = {}, configProps = {}, runtimeProps = {}, files }: FileUtilsPropConfig
) => {
    if (val.includes(BIND_FILES)) {
        const key = val.replace(BIND_FILES, '').replace('}}', '');
        const nVal = lGet(files, key);
        obj[newKey] = resolvePackage(nVal) as T[K];
        return;
    }
    const bindToProp: Record<string, Record<string, string> | Record<string, any>> = {
        [BIND_PROPS]: props,
        [BIND_CONFIG_PROPS]: configProps,
        [BIND_RUNTIME_PROPS]: runtimeProps
    };
    const binder = Object.keys(bindToProp).find((bind) => val.includes(bind));
    if (binder) {
        for (const [k, v] of Object.entries(bindToProp[binder])) {
            val = val.replace(`${BIND_PROPS}${k}}}`, v);
            obj[newKey] = resolvePackage(val) as T[K];
        }
        return;
    }
    if (val.includes(BIND_ENV)) {
        const key = val.replace(BIND_ENV, '').replace('}}', '');
        obj[newKey] = process.env[key] as T[K];
    }
};

export const mergeObjects = <T1>(
    c: RnvContext,
    obj1: Partial<T1>,
    obj2: Partial<T1>,
    dynamicRefs = true,
    replaceArrays = false
) => {
    if (!obj2) return obj1 as T1;
    if (!obj1) return obj2 as T1;
    const obj = merge(obj1, obj2, {
        arrayMerge: replaceArrays ? _arrayMergeOverride : arrayMerge
    });
    const out = dynamicRefs ? sanitizeDynamicRefs(c, obj) : obj;
    return out as T1;
};

export const replaceHomeFolder = (p: string) => {
    if (getContext().isSystemWin) return p.replace('~', process.env.USERPROFILE || '');
    return p.replace('~', process.env.HOME || '');
};

export const getFileListSync = (dir: PathLike) => {
    let results: Array<string> = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const fileFixed = `${dir}/${file}`;
        const stat = fs.statSync(fileFixed);
        if (stat?.isDirectory()) {
            /* Recurse into a subdirectory */
            results = results.concat(getFileListSync(fileFixed));
        } else {
            /* Is a file */
            results.push(fileFixed);
        }
    });
    return results;
};

export const loadFile = <T, K extends Extract<keyof T, string>>(
    fileObj: T,
    pathObj: Partial<Record<K, unknown>>,
    key: K
) => {
    const pKey = `${key}Exists` as K;
    const pth = pathObj[key];

    if (typeof pth === 'string' && !fsExistsSync(pth)) {
        pathObj[pKey] = false;
        logDebug(`WARNING: loadFile: Path ${pathObj[key]} does not exists!`);
        logDebug(`FILE_EXISTS: ${key}:false path:${pathObj[key]}`);
        return false;
    }
    pathObj[pKey] = true;
    try {
        if (typeof pth === 'string') {
            const fileString = fsReadFileSync(pth).toString();
            fileObj[key] = JSON.parse(fileString);
            pathObj[pKey] = true;
            logDebug(`FILE_EXISTS: ${key}:true size:${formatBytes(Buffer.byteLength(fileString, 'utf8'))}`);
        }

        return fileObj[key];
    } catch (e) {
        throw new Error(`loadFile: ${pathObj[key]} :: ${e}`); // crash if there's an error in the config file
    }
};

export const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

// Return all directories within a directory
export const getDirectories = (source: string) =>
    fs
        .readdirSync(source, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

export const cleanEmptyFoldersRecursively = (folder: string) => {
    const isDir = fsStatSync(folder).isDirectory();
    if (!isDir) {
        return;
    }
    let files = fsReaddirSync(folder);
    if (files.length > 0) {
        files.forEach((file) => {
            const fullPath = path.join(folder, file);
            cleanEmptyFoldersRecursively(fullPath);
        });

        // re-evaluate files; after deleting subfolder
        // we may have parent folder empty now
        files = fsReaddirSync(folder);
    }

    if (files.length === 0) {
        fs.rmdirSync(folder);
    }
};

export const getRelativePath = (from: string, to: string) => {
    const relativePath = path.relative(from, to);
    if (!relativePath.startsWith('.')) {
        return `.${path.sep}${relativePath}`;
    }
    return relativePath;
};

export const copyContentsIfNotExistsRecursiveSync = (src: string, dest: string) => {
    const filesOrDirs = fsReaddirSync(src);
    for (const fd of filesOrDirs) {
        const srcPath = path.join(src, fd);
        const destPath = path.join(dest, fd);

        if (!fsExistsSync(destPath)) {
            logInfo(`Copying ${fd} to ${dest}`);
            if (fsStatSync(srcPath).isDirectory()) {
                copyFolderRecursiveSync(srcPath, dest);
            } else {
                fsCopyFileSync(srcPath, destPath);
            }
        }
    }
};

export default {
    sanitizeDynamicRefs,
    getFileListSync,
    removeDirs,
    copyFileSync,
    copyFolderRecursiveSync,
    removeDirsSync,
    removeFilesSync,
    saveAsJs,
    mkdirSync,
    copyFolderContentsRecursive,
    copyFolderContentsRecursiveSync,
    cleanFolder,
    writeFileSync,
    readObjectSync,
    updateObjectSync,
    arrayMerge,
    mergeObjects,
    replaceHomeFolder,
    getDirectories,
    resolvePackage,
    cleanEmptyFoldersRecursively,
    copyContentsIfNotExistsRecursiveSync
};
