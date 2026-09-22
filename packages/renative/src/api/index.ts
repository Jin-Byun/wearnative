import engine from './engine';
import factor from './factor';
import isWebBased from './isWebBased';
import platform from './platform';

export { engine, factor, isWebBased, platform };

export const getScaledValue = (v: number) => {
    return v;
};

export default {
    platform,
    formFactor: factor,
    factor,
    engine,
    isWebBased
};
