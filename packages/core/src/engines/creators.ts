import { getContext } from '../context/provider';
import type { RnvModule } from '../modules/types';
import { createTaskMap } from '../tasks/creators';
import { generateEngineExtensions } from '.';
import { extractEngineId } from './nameExtractor';
import type { CreateRnvEngineOpts, RnvEngine, RnvEnginePlatforms } from './types';

type AnyRnvModule = RnvModule<any, any>;

export const createRnvEngine = <
    OKey extends string = never,
    Modules extends [AnyRnvModule, ...AnyRnvModule[]] = [RnvModule<never, object>]
>(
    opts: CreateRnvEngineOpts<OKey, Modules>
) => {
    if (!opts.config.name) {
        throw new Error('Engine name is required. check your renative.engine.json file');
    }
    // This allows users to use shortcut of the full engine names
    // ie: "-e engine-rn" instead of "-e @rnv/engine-rn"
    const id = extractEngineId(opts.config.name);
    const platforms: RnvEnginePlatforms = opts.platforms;
    for (const plat of Object.values(platforms).filter(Boolean)) {
        plat.extensions = generateEngineExtensions(id, plat.extensions, opts.config.engineExtension);
    }

    const engine: RnvEngine<OKey, Modules> = {
        ...opts,
        platforms,
        id: opts.config.name,
        serverDirName: opts.serverDirName || '',
        projectDirName: opts.projectDirName || '',
        runtimeExtraProps: opts.runtimeExtraProps || {},
        tasks: createTaskMap<any, any>({
            tasks: [...opts.tasks, ...(opts.extendModules?.flatMap((m) => m.originalTasks) ?? [])],
            ownerID: opts.config.name,
            ownerType: 'engine'
        }),
        initContextPayload: () => {
            opts.extendModules?.forEach((m) => {
                m.initContextPayload();
            });
        },
        getContext
    };

    return engine;
};
