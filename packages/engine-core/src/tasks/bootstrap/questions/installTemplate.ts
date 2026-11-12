import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
    type ConfigFileProject,
    type ConfigFileTemplate,
    chalk,
    copyFileSync,
    copyFolderRecursiveSync,
    executeAsync,
    fsExistsSync,
    fsLstatSync,
    fsMkdirSync,
    fsReaddirSync,
    getPacManCommand,
    inquirerPrompt,
    inquirerSeparator,
    isYarnInstalled,
    listAndSelectNpmVersion,
    logInfo,
    type NpmPackageFile,
    type RnvContext,
    RnvFileName,
    RnvFolderName,
    readObjectSync,
    writeFileSync
} from '@rnv/core';
import { merge } from 'lodash';
import { getContext } from '../../../getContext';
import { checkInputValue, saveProgressIntoProjectConfig } from '../questionHelpers';
import type { NewProjectData, TemplateOption } from '../types';

const mergeIntoProjectConfig = ({ files }: NewProjectData, updateObj: ConfigFileProject) => {
    files.project.renativeConfig = merge(files.project.renativeConfig, updateObj);
};

const mergeIntoProjectPackage = ({ files }: NewProjectData, updateObj: NpmPackageFile) => {
    files.project.packageJson = merge(files.project.packageJson, updateObj);
};

const selectTemplate = async (
    projectTemplateArray: [
        string,
        {
            packageName?: string | undefined;
            description?: string | undefined;
            localPath?: string | undefined;
        }
    ][],
    templateName: string
): Promise<TemplateOption['value']> => {
    const options: TemplateOption[] = projectTemplateArray.map(([k, v]) => {
        return {
            name: `${k} ${chalk.grey(`- ${v.localPath || v.description}`)}`,
            value: { ...v, type: 'existing', packageName: v?.packageName || k }
        };
    });
    const defaultOverride = options.findLast(({ value }) => !!value.localPath)?.value ?? templateName;
    options.push(
        inquirerSeparator('Advanced:----------------'),
        { name: 'Custom Template (npm)...', value: { type: 'custom' } },
        { name: 'Local Template...', value: { type: 'local' } },
        { name: 'No Template (blank project)', value: { type: 'none' } }
    );
    return (await inquirerPrompt({
        name: 'result',
        type: 'list',
        message: 'What template to use?',
        default: defaultOverride,
        loop: false,
        choices: options
    })) as TemplateOption['value'];
};

const extractIgnorePath = (c: RnvContext): Set<string> => {
    const ignorePathSet = new Set<string>([
        RnvFolderName.nodeModules,
        'package-lock.json',
        'yarn.lock',
        RnvFolderName.platformBuilds,
        'builds',
        RnvFolderName.platformAssets,
        RnvFolderName.secrets,
        RnvFolderName.dotRnv
    ]);
    try {
        const gitIgnorePathSet = execFileSync(
            'git',
            ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
            {
                cwd: c.paths.project.dir,
                encoding: 'utf8'
            }
        )
            .split(/\r?\n/)
            .filter(Boolean);
        return ignorePathSet.union(new Set<string>(gitIgnorePathSet));
    } catch {}
    return ignorePathSet;
};

const Question = async (data: NewProjectData) => {
    // initialization (data fetching)
    const { inputs, defaults, files } = data;

    const c = getContext();
    const { templateVersion, projectTemplate } = c.program.opts();
    let { localTemplatePath } = c.program.opts();

    const projectTemplateArray = Object.entries(c.buildConfig.projectTemplates || {});

    inputs.template = {};

    // check if template declared, if not, get template
    if (checkInputValue(projectTemplate)) {
        inputs.template.packageName = projectTemplate;
    } else if (!checkInputValue(localTemplatePath)) {
        const result = await selectTemplate(projectTemplateArray, defaults.templateName);
        inputs.template.type = result.type;

        switch (result.type) {
            case 'none':
                throw new Error('No templates Not Supported');
            case 'existing':
                if (result.localPath) {
                    localTemplatePath = result.localPath;
                } else {
                    inputs.template.packageName = result.packageName;
                }
                break;
            case 'custom': {
                inputs.template.packageName = (await inquirerPrompt({
                    name: 'inputTemplateCustom',
                    type: 'input',
                    message: 'NPM package name:'
                })) as string;
                break;
            }
            case 'local': {
                localTemplatePath = (await inquirerPrompt({
                    name: 'inputTemplateLocal',
                    type: 'input',
                    message: 'Path (absolute):'
                })) as string;
            }
        }
    }

    // by this point, either the packageName or localTemplatePath should be set.
    if (checkInputValue(localTemplatePath)) {
        const localTemplatePackage = path.join(localTemplatePath, RnvFileName.package);
        const checkLocalTplPath = [
            localTemplatePath,
            path.join(localTemplatePath, RnvFileName.renativeTemplate),
            localTemplatePackage
        ].some((pth) => !fsExistsSync(pth));
        if (checkLocalTplPath) {
            throw new Error(
                `Local template path ${localTemplatePath} invalid. Please check for correctness and if path contains ${RnvFileName.renativeTemplate} and ${RnvFileName.package}`
            );
        }
        const pkg = readObjectSync<NpmPackageFile>(localTemplatePackage);
        if (!pkg?.name) {
            throw new Error(`Invalid package ${localTemplatePackage} missing name field`);
        }

        inputs.template.packageName = pkg.name;
        inputs.template.version = pkg.version;
        inputs.template.localPath = localTemplatePath;
        if (projectTemplateArray.some(([_, value]) => value.localPath === localTemplatePath)) {
            inputs.template.type = 'existing';
        }
        logInfo(`Found local template: ${pkg.name}@${pkg.version}`);

        const nmTemplatePath = path.join(c.paths.project.dir, RnvFolderName.dotRnv, RnvFolderName.npmCache, pkg.name);
        fsMkdirSync(nmTemplatePath, { recursive: true });

        const ignorePathSet = extractIgnorePath(c);
        for (const file of fsReaddirSync(localTemplatePath)) {
            if (ignorePathSet.has(file)) continue;

            const sourcePath = path.join(localTemplatePath, file);
            if (fsLstatSync(sourcePath).isDirectory()) {
                copyFolderRecursiveSync(sourcePath, nmTemplatePath);
            } else {
                const destPath = path.join(nmTemplatePath, file);
                copyFileSync(sourcePath, destPath);
            }
        }

        const copiedlocalTemplatePath = path.join(
            RnvFolderName.dotRnv,
            RnvFolderName.npmCache,
            inputs.template.packageName
        );

        if (!isYarnInstalled()) {
            // NOTE: this is a workaround for npm/yarn bug where manually added packages are overriden on next install
            const localPackageFilePath = path.join(copiedlocalTemplatePath, RnvFileName.package);
            const localPackageFile = readObjectSync<NpmPackageFile>(localPackageFilePath);
            if (localPackageFile) {
                delete localPackageFile.devDependencies;
                writeFileSync(localPackageFilePath, localPackageFile);
            }
        }
        const filePath = `file:${copiedlocalTemplatePath}`;
        mergeIntoProjectPackage(data, {
            devDependencies: {
                [inputs.template?.packageName]: filePath
            }
        });
        mergeIntoProjectConfig(data, {
            templateConfig: {
                name: inputs.template.packageName,
                version: filePath
            }
        });
        await saveProgressIntoProjectConfig(data);

        await executeAsync(await getPacManCommand(c, 'init'), {
            cwd: c.paths.project.dir
        });
    } else {
        if (!checkInputValue(templateVersion) && !inputs.template.packageName) {
            throw new Error('Template package name is required');
        }
        inputs.template.version = checkInputValue(templateVersion)
            ? templateVersion
            : await listAndSelectNpmVersion(inputs.template.packageName as string);

        const pkgInstallScript = `${await getPacManCommand(c)} ${inputs.template.packageName}@${inputs.template.version} --dev`;
        await executeAsync(pkgInstallScript, { cwd: c.paths.project.dir });

        if (inputs.template.packageName && inputs.template.version) {
            // We update our in-memory package.json with the new template
            mergeIntoProjectPackage(data, {
                devDependencies: {
                    [inputs.template.packageName]: inputs.template.version
                }
            });
        }
        mergeIntoProjectConfig(data, {
            templateConfig: {
                name: inputs.template.packageName,
                version: inputs.template.version
            }
        });
        await saveProgressIntoProjectConfig(data);
        // Check if node_modules folder exists
        const nmDir = path.join(c.paths.project.dir, RnvFolderName.nodeModules);
        if (!fsExistsSync(nmDir)) {
            throw new Error(
                `${pkgInstallScript} : FAILED. this could happen if you have package.json accidentally created somewhere in parent directory`
            );
        }
    }
    if (!inputs.template.packageName) return;

    const templateDir = path.join(c.paths.project.dir, RnvFolderName.nodeModules, inputs.template.packageName);

    const renativeTemplateConfig =
        readObjectSync<ConfigFileTemplate>(path.join(templateDir, RnvFileName.renativeTemplate)) || {};
    files.template.renativeTemplateConfig = renativeTemplateConfig;

    const renativeConfig = readObjectSync<ConfigFileProject>(path.join(templateDir, RnvFileName.renative));
    if (renativeConfig) {
        files.template.renativeConfig = renativeConfig;
    }
};

export default Question;
