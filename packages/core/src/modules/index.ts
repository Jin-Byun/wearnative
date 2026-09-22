import path from 'node:path';
import { getContext } from '../context/provider';
import { logDefault, logWarning } from '../logger';
import { fsExistsSync } from '../system/fs';
import { registerRnvTasks } from '../tasks/taskRegistry';
import type { RnvModule } from './types';

export const loadRnvModulesFromProject = () => {
    logDefault('loadRnvModulesFromProject');
    const c = getContext();

    const integrations = c.buildConfig?.integrations;

    if (!integrations) {
        return;
    }
    Object.keys(integrations).forEach((integration) => {
        // Local node modules take precedence
        let intPath = path.join(c.paths.project.nodeModulesDir, integration);
        if (!fsExistsSync(intPath)) {
            intPath = integration;
        }
        try {
            const instance: RnvModule = require(intPath)?.default;
            if (instance) {
                c.runtime.modulesByIndex.push(instance);
                registerRnvTasks(instance.tasks);
                instance.initContextPayload();
            }
        } catch (err) {
            logWarning(`You have integration ${integration} defined, but it wasn't found in package.json. ERR: ${err}`);
        }
    });
};
