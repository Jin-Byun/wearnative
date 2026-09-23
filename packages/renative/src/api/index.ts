import engine from './engine';
import factor from './factor';
import isWebBased from './isWebBased';
import platform from './platform';

export { engine, factor, isWebBased, platform };

export default {
    platform,
    formFactor: factor,
    factor,
    engine,
    isWebBased
};
