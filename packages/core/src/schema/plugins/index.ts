import { z } from 'zod';
import { zodPluginBaseFragment } from './fragments/base';
import { zodPluginPlatformAndroidFragment } from './fragments/platformAndroid';
import { zodPluginPlatformBaseFragment } from './fragments/platformBase';

const zodAndroidSchema = zodPluginPlatformBaseFragment.extend(zodPluginPlatformAndroidFragment.shape).nullable();

export const zodPluginSchema = zodPluginBaseFragment.extend(
    z
        .object({
            androidwear: zodAndroidSchema
        })
        .partial().shape
);

export const zodPluginsSchema = z
    .record(z.string(), z.union([zodPluginSchema, z.string()]).nullable())
    .describe(
        'Define all plugins available in your project. you can then use `includedPlugins` and `excludedPlugins` props to define active and inactive plugins per each app config'
    );
