import fs from 'node:fs';
import path from 'node:path';
import { getContext, logSuccess, ZodFileSchema, ZodSharedSchema } from '@rnv/core';
import { z } from 'zod';

export const generateSchema = () => {
    const { zodConfigFileRoot } = ZodFileSchema;
    // CURRENT
    const definitions: Record<string, any> = Object.values(ZodSharedSchema).reduce(
        (acc, val) => Object.assign(acc, val),
        {}
    );
    _generateSchemaFile({ schema: zodConfigFileRoot, schemaId: 'renative-1.0.schema', definitions });

    logSuccess('Sucessfully exported renative.project.json schema');
};

// This is just to speed up the process of generating schema files as rnv does this on every run per project
const SCHEMA_DEST_DIRS = [
    '.rnv/schema',
    'packages/core/jsonSchema',
    'packages/app-harness/.rnv/schema',
    'packages/template-starter/.rnv/schema'
];

const _generateSchemaFile = ({
    schema,
    schemaId,
    definitions
}: {
    schema: z.ZodObject<any>;
    schemaId: string;
    definitions?: Record<string, any>;
}) => {
    const metadata = z.registry<{ id: string }>();
    if (definitions) {
        for (const [id, def] of Object.entries(definitions)) {
            metadata.add(def, { id });
        }
    }
    metadata.add(schema, { id: schemaId });
    const schemaXtnd = schema.extend({
        $schema: z.string().describe('schema definition').optional()
    });
    const jsonSchema = z.toJSONSchema(schemaXtnd, { metadata, reused: 'ref' });
    jsonSchema.$schema = 'http://json-schema.org/draft-04/schema#';

    const ctx = getContext();
    for (const destDir of SCHEMA_DEST_DIRS) {
        const destFolder = path.join(ctx.paths.project.dir, destDir);
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }
        const destPath = path.join(destFolder, `${schemaId}.json`);
        fs.writeFileSync(destPath, JSON.stringify(jsonSchema, null, 2));
    }
};
