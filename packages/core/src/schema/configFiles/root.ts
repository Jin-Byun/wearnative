import { type ZodObject, z } from 'zod';
import { zodRootAppBaseFragment } from './app';
import { zodConfigFileEngine } from './engine';
import { zodConfigFileIntegration } from './integration';
import { zodConfigFileLocal } from './local';
import { zodConfigFileOverrides } from './overrides';
import { zodConfigFilePlugin } from './plugin';
import { zodConfigFilePrivate } from './private';
import { zodConfigFileProject } from './project';
import { zodConfigFileTemplate } from './template';
import { zodConfigFileTemplates } from './templates';
import { zodConfigFileWorkspace } from './workspace';
import { zodConfigFileWorkspaces } from './workspaces';

const zodConfigFileRoot: ZodObject = z.object({
    app: zodRootAppBaseFragment,
    project: zodConfigFileProject,
    local: zodConfigFileLocal,
    overrides: zodConfigFileOverrides,
    integration: zodConfigFileIntegration,
    engine: zodConfigFileEngine,
    plugin: zodConfigFilePlugin,
    private: zodConfigFilePrivate,
    template: zodConfigFileTemplate,
    configTemplates: zodConfigFileTemplates,
    workspace: zodConfigFileWorkspace,
    workspaces: zodConfigFileWorkspaces
});

export default zodConfigFileRoot;
