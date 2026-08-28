import { RnvModuleType } from '../modules/types';
import type { CreateRnvTaskOpt, RnvTask, RnvTaskMap, RnvTaskOption } from './types';

export const createTask = <OKey = never>(task: CreateRnvTaskOpt<OKey>) => {
    return { ...task, key: 'unknown', ownerID: 'unknown' };
};

type TaskOptionsMap<OKey> = Record<Extract<OKey, string>, RnvTaskOption<OKey>>;
export const createTaskOptionsMap = <OKey>(opts: ReadonlyArray<RnvTaskOption<OKey>>): TaskOptionsMap<OKey> => {
    const map: Partial<TaskOptionsMap<OKey>> = {};
    for (const opt of opts) {
        map[opt.altKey ?? opt.key] = opt;
    }
    return map as TaskOptionsMap<OKey>;
};

type TaskOptionsPreset<OKey, PKey> = Record<
    Extract<PKey, string>,
    (arr?: ReadonlyArray<RnvTaskOption<OKey>>) => ReadonlyArray<RnvTaskOption<OKey>>
>;
export const createTaskOptionsPreset = <OKey, PKey extends string>(
    opts: Record<PKey, ReadonlyArray<RnvTaskOption<OKey>>>
) => {
    const preset: Partial<TaskOptionsPreset<OKey, PKey>> = {};
    for (const key in opts) {
        const oArr = opts[key];
        if (oArr) {
            preset[key] = (arr?) => oArr.concat(arr || []);
        }
    }

    return preset as TaskOptionsPreset<OKey, PKey>;
};

export const createTaskMap = <OKey, Payload>({ownerID, tasks, ownerType}: {
    tasks: ReadonlyArray<RnvTask<OKey, Payload>>;
    ownerID: string;
    ownerType: RnvModuleType;
}) => {
    const output: RnvTaskMap<OKey, Payload> = {};

    if (!ownerID) throw new Error('generateRnvTaskMap() requires config.<packageName | name> to be defined!');

    const idAndType = {ownerID, ownerType}

    tasks.forEach((taskBlueprint) => {
        const taskInstance = { ...taskBlueprint };
        const plts = taskInstance.platforms || [];
        const key = `${ownerID}:${plts.join('-')}:${taskInstance.task}`;
        output[key] = Object.assign(taskInstance, idAndType, {key});
    });
    return output;
};
