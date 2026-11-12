import { type ZodObject, z } from 'zod';
import { zodCommonSchemaFragment } from '../common';
import { zodPlatformAndroidFragment } from './fragments/android';
import { zodPlatformBaseFragment } from './fragments/base';
import { zodPlatformReactNativeFragment } from './fragments/reactNative';
import { zodTemplateAndroidFragment } from './fragments/templateAndroid';

const createPlatformSchema = <T extends z.ZodRawShape>(obj: ZodObject<T>) => {
    const zodPlatformSchema = zodCommonSchemaFragment.extend(zodPlatformBaseFragment.shape).extend(obj.shape);
    return z
        .object({ buildSchemes: z.record(z.string(), zodPlatformSchema) })
        .extend(zodPlatformSchema.shape)
        .partial();
};

const androidSchema = createPlatformSchema(
    zodPlatformAndroidFragment.extend(zodPlatformReactNativeFragment.extend(zodTemplateAndroidFragment.shape).shape)
);

export const zodPlatformsSchema = z
    .object({
        androidwear: androidSchema
    })
    .partial()
    .describe('Object containing platform configurations');
