import type { RnvContext } from '@rnv/core';

const hooks = {
    hello: async (c: RnvContext) => {
        console.log('Hello build hook!', c.rnvVersion);
    }
};

const pipes = {};

export { hooks, pipes };
