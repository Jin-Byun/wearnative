export * from './adapters';
export * from './androidRunner';
export * from './common';
export * from './env';
export * from './metroRunner';

import { createRnvModule, type GetContextType } from '@rnv/core';
import taskStart from './tasks/taskStart';

const RnvModule = createRnvModule({
    tasks: [taskStart],
    name: '@rnv/sdk-react-native',
    type: 'internal'
});

export default RnvModule;

export type GetContext = GetContextType<typeof RnvModule.getContext>;
