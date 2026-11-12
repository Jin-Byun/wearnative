import path from 'node:path';
import { getContext } from '../context/provider';
import { logDefault } from '../logger';
import { copyFolderContentsRecursiveSync, fsMkdirSync } from '../system/fs';

export const generateLocalJsonSchemas = async () => {
    logDefault('generateLocalJsonSchemas');
    const ctx = getContext();
    const schemaDestDir = path.join(ctx.paths.project.dotRnvDir, 'schema');
    fsMkdirSync(schemaDestDir, { recursive: true });

    const schemaSourceDir = path.join(__dirname, '../../jsonSchema');
    copyFolderContentsRecursiveSync(schemaSourceDir, schemaDestDir);
};
