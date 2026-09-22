import { chalk, getContext, logWarning, type OverridesOptions } from '@rnv/core';
import colorString from 'color-string';

export const addSystemInjects = (injects: OverridesOptions) => {
    const c = getContext();
    if (!c.systemPropsInjects) c.systemPropsInjects = [];
    c.systemPropsInjects.push(...injects);
};

export const sanitizeColor = (val: string | undefined, key: string) => {
    if (!val) {
        logWarning(
            `You are missing ${chalk.bold.white(key)} in your renative config. will use default #FFFFFF instead`
        );
        return '#FFFFFF';
    }
    const rgb = colorString.get.rgb(val);
    if (!rgb) {
        logWarning(
            `Value of ${chalk.bold.white(key)} in your renative config is invalid. will use default #FFFFFF instead`
        );
        return '#FFFFFF';
    }
    return colorString.to.hex(rgb[0], rgb[1], rgb[2]);
};
