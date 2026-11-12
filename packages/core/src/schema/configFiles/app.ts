import { z } from 'zod';
import { zodExt } from '../shared';
import { zodRootProjectCommonSchema, zodRootProjectPlatformsSchema, zodRootProjectPluginsSchema } from './project';

export const zodRootAppBaseFragment = z
    .object({
        id: z
            .string()
            .describe('ID of the app in `./appConfigs/[APP_ID]/renative.json`. MUST match APP_ID name of the folder'),
        custom: z.optional(zodExt),
        hidden: z
            .boolean()
            .describe(
                'If set to true in `./appConfigs/[APP_ID]/renative.json` the APP_ID will be hidden from list of appConfigs `-c`'
            ),
        extendsTemplate: z
            .string()
            .describe(
                'You can extend another renative.json file of currently applied template by providing relative or full package name path. Exampe: `@rnv/template-starter/renative.json`'
            ), // TODO: rename to "extendsConfig"
        extend: z.string().describe('extend another appConfig by id') // TODO: rename to "extendsAppConfigID"
    })
    .partial();

export const zodConfigFileApp = zodRootAppBaseFragment
    .extend(zodRootProjectCommonSchema.shape)
    .extend(zodRootProjectPlatformsSchema.shape)
    .extend(zodRootProjectPluginsSchema.shape);
