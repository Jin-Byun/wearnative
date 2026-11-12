import { type ConfigFileEngine, createRnvEngine, type GetContextType } from '@rnv/core';
import taskAppConfigure from './tasks/app/taskAppConfigure';
import taskAppCreate from './tasks/app/taskAppCreate';
import taskSwitch from './tasks/app/taskAppSwitch';
import taskNew from './tasks/bootstrap/taskNew';
import taskCryptoDecrypt from './tasks/crypto/taskCryptoDecrypt';
import taskCryptoEncrypt from './tasks/crypto/taskCryptoEncrypt';
import taskClean from './tasks/global/taskClean';
import taskConfig from './tasks/global/taskConfig';
import taskRvnDoctor from './tasks/global/taskDoctor';
import taskHelp from './tasks/global/taskHelp';
import taskInfo from './tasks/global/taskInfo';
import taskRvnKill from './tasks/global/taskKill';
import taskHooksList from './tasks/hooks/taskHooksList';
import taskHooksPipes from './tasks/hooks/taskHooksPipes';
import taskHooksRun from './tasks/hooks/taskHooksRun';
import taskLink from './tasks/linking/taskLink';
import taskUnlink from './tasks/linking/taskUnlink';
import taskPatchReset from './tasks/patch/taskPatchReset';
import taskPlatformConfigure from './tasks/platform/taskPlatformConfigure';
import taskPlatformConnect from './tasks/platform/taskPlatformConnect';
import taskPlatformEject from './tasks/platform/taskPlatformEject';
import taskPlatformList from './tasks/platform/taskPlatformList';
import taskPluginAdd from './tasks/plugin/taskPluginAdd';
import taskPluginList from './tasks/plugin/taskPluginList';
import taskPluginUpdate from './tasks/plugin/taskPluginUpdate';
import taskConfigureSoft from './tasks/project/taskConfigureSoft';
import taskProjectConfigure from './tasks/project/taskProjectConfigure';
import taskPlatformSetup from './tasks/project/taskProjectPlatforms';
import taskProjectUpgrade from './tasks/project/taskProjectUpgrade';
import taskTemplateApply from './tasks/template/taskTemplateApply';
import taskWorkspaceAdd from './tasks/workspace/taskWorkspaceAdd';
import taskWorkspaceConfigure from './tasks/workspace/taskWorkspaceConfigure';
import taskWorkspaceConnect from './tasks/workspace/taskWorkspaceConnect';
import taskWorkspaceList from './tasks/workspace/taskWorkspaceList';

const Config: ConfigFileEngine = {
    platforms: {},
    npm: {},
    engineExtension: 'core',
    name: '@rnv/engine-core'
};

const Engine = createRnvEngine({
    serverDirName: '',
    tasks: [
        taskCryptoDecrypt,
        taskCryptoEncrypt,
        taskPlatformEject,
        taskPlatformConnect,
        taskPlatformList,
        taskPlatformConfigure,
        taskPlatformSetup,
        taskTemplateApply,
        taskPluginAdd,
        taskPluginList,
        taskPluginUpdate,
        taskWorkspaceList,
        taskWorkspaceAdd,
        taskWorkspaceConnect,
        taskHooksList,
        taskHooksRun,
        taskHooksPipes,
        taskClean,
        taskInfo,
        taskConfig,
        taskHelp,
        taskNew,
        taskProjectConfigure,
        taskProjectUpgrade,
        taskAppConfigure,
        taskAppCreate,
        taskWorkspaceConfigure,
        taskConfigureSoft,
        taskRvnKill,
        taskRvnDoctor,
        taskLink,
        taskUnlink,
        taskSwitch,
        taskPatchReset
    ],
    config: Config,
    projectDirName: '',
    platforms: {},
    rootPath: __dirname
});

// export newly decorated type for getContext proxy with decorated types
export type GetContext = GetContextType<typeof Engine.getContext>;

export default Engine;
