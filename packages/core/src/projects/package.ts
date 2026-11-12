import path from 'node:path';
import merge from 'deepmerge';
import type { NpmPackageFile } from '../configs/types';
import { writeRenativeConfigFile } from '../configs/utils';
import { getContext } from '../context/provider';
import type { RnvContext } from '../context/types';
import { RnvFileName } from '../enums/fileName';
import { logDefault, logInfo, logWarning } from '../logger';
import type { ConfigFileTemplate } from '../schema/types';
import { fsExistsSync, fsWriteFileSync, loadFile, readObjectSync } from '../system/fs';

export const updatePackage = (override: Partial<NpmPackageFile>) => {
    const c = getContext();
    const newPackage: NpmPackageFile = merge(c.files.project.package, override);
    writeRenativeConfigFile(c.paths.project.package, newPackage);
    c.files.project.package = newPackage;
    c._requiresNpmInstall = true;
};

const packageJsonIsValid = (c: RnvContext) => {
    if (!fsExistsSync(c.paths.project.package)) return false;
    const pkg = readObjectSync(c.paths.project.package);
    if (!pkg) return false;
    // yarn add creates a package.json with only dependencies, that is not valid
    return !(Object.keys(pkg).length === 1 && Object.hasOwn(pkg, 'dependencies'));
};

export const checkAndCreateProjectPackage = async (c: RnvContext) => {
    logDefault('checkAndCreateProjectPackage');

    if (packageJsonIsValid(c)) {
        loadFile(c.files.project, c.paths.project, 'package');
        return;
    }

    logInfo(`Your ${c.paths.project.package} is missing. CREATING...DONE`);
    const projectConfig = c.files.project.config;
    const templateName = projectConfig?.templateConfig?.name;
    if (!templateName) {
        logWarning('You are missing currentTemplate in your renative.json');
    } else {
        c.paths.template.configTemplate = path.join(
            c.paths.project.dir,
            'node_modules',
            templateName,
            RnvFileName.renativeTemplate
        );
    }

    const templateObj = readObjectSync<ConfigFileTemplate>(c.paths.template.configTemplate);
    const pkgJson = templateObj?.templateConfig?.package_json || {};
    pkgJson.name = projectConfig?.projectName || c.paths.project.dir.split('/').pop();
    pkgJson.version = projectConfig?.projectVersion || '0.1.0';
    pkgJson.dependencies = pkgJson.dependencies || {};
    // No longer good option to assume same version

    pkgJson.devDependencies = pkgJson.devDependencies || {};
    const rnvVersion = c.files.rnvCore.package.version;
    if (rnvVersion) {
        pkgJson.devDependencies.rnv = rnvVersion;
    }

    if (templateName) {
        pkgJson.devDependencies[templateName] = projectConfig?.templateConfig?.version || 'latest';
    }
    const pkgJsonStringClean = JSON.stringify(pkgJson, null, 2);
    fsWriteFileSync(c.paths.project.package, pkgJsonStringClean);

    loadFile(c.files.project, c.paths.project, 'package');
};
