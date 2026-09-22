import { generateSchema } from '@rnv/build-hooks-schema';

try {
    generateSchema();
} catch (err) {
    console.error('Failed to generate Schema', err);
    process.exit(1);
}
