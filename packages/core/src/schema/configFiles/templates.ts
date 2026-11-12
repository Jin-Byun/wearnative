import { z } from 'zod';
import { zodPluginsSchema } from '../plugins';
import { zodPlatformsKeys, zodProjectTemplates } from '../shared';

export const zodConfigFileTemplates = z
    .object({
        projectTemplates: zodProjectTemplates,
        engineTemplates: z.record(
            z.string(),
            z.object({
                version: z.string(),
                id: z.string(),
                key: z.string()
            })
        ),
        integrationTemplates: z.record(
            z.string(),
            z.object({
                version: z.string()
            })
        ),
        platformTemplates: z.record(
            zodPlatformsKeys,
            z.object({
                engine: z.string()
            })
        ),
        pluginTemplates: zodPluginsSchema,
        disableRnvDefaultOverrides: z
            .boolean()
            .describe(
                'Disables default rnv scope plugin overrides and merges. Useful if you want to test entirely clean plugin template list'
            )
    })
    .partial();
