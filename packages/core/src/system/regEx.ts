export const matchRegEx = (str: string, regEx: RegExp, limit = 1000) => {
    if (str.length > limit) {
        throw new Error('Input too long');
    }
    return str.match(regEx);
};

export const escapeRegEx = (str: string) => {
    return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
};
