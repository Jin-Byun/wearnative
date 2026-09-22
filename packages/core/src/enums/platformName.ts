export const RnvPlatformName = {
    androidwear: 'androidwear',
    android: 'android'
} as const;

// IMPORTANT: this must match RnvPlatformName size and key order
export const RnvPlatforms = [RnvPlatformName.androidwear, RnvPlatformName.android] as const;
