import { z } from 'zod';
import { zodPluginSchema } from '../plugins';
import { zodExt } from '../shared';

export const zodPluginFragment = z.object({
    custom: z.optional(zodExt)
});

export const zodConfigFilePlugin = zodPluginSchema.extend(zodPluginFragment.shape).partial();
