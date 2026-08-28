import { AnyZodObject, z } from 'zod';
import { zodPluginPlatformAndroidFragment } from './fragments/platformAndroid';
import { zodPluginPlatformBaseFragment } from './fragments/platformBase';
import { zodPluginBaseFragment } from './fragments/base';

const zodAndroidSchema = zodPluginPlatformBaseFragment.merge(zodPluginPlatformAndroidFragment).nullable();

export const zodPluginSchema: AnyZodObject = zodPluginBaseFragment.merge(
    z
        .object({
            androidwear: zodAndroidSchema,
        })
        .partial()
);

export const zodPluginsSchema = z
    .record(z.string(), z.union([zodPluginSchema, z.string()]).nullable())
    .describe(
        'Define all plugins available in your project. you can then use `includedPlugins` and `excludedPlugins` props to define active and inactive plugins per each app config'
    );
