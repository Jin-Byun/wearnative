import type { ProgramOptionsKey } from '../tasks/taskOptions';
import type { RnvContext } from './types';

// We separate this context access from the rest to avoid circular reference issues
export const getContext = <C = any, OKey extends string = ProgramOptionsKey>(): RnvContext<
    C,
    ProgramOptionsKey<OKey>
> => {
    return global.RNV_CONTEXT as RnvContext<C, ProgramOptionsKey<OKey>>;
};
