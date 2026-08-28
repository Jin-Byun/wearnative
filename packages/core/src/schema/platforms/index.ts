import { AnyZodObject, z } from 'zod';
import { zodPlatformReactNativeFragment } from './fragments/reactNative';
import { zodPlatformBaseFragment } from './fragments/base';
import { zodCommonSchemaFragment } from '../common';
import { zodPlatformAndroidFragment } from './fragments/android';
import { zodTemplateAndroidFragment } from './fragments/templateAndroid';

const createPlatformSchema = (obj: AnyZodObject): AnyZodObject => {
    const zodPlatformSchema = zodCommonSchemaFragment.merge(zodPlatformBaseFragment).merge(obj);
    return z
        .object({ buildSchemes: z.record(z.string(), zodPlatformSchema) })
        .merge(zodPlatformSchema)
        .partial();
};

const androidSchema = createPlatformSchema(
    zodPlatformAndroidFragment.merge(zodPlatformReactNativeFragment.merge(zodTemplateAndroidFragment))
);

export const zodPlatformsSchema: AnyZodObject = z
    .object({
        androidwear: androidSchema,
    })
    .partial()
    .describe('Object containing platform configurations');
