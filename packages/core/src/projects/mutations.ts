import type { RnvContext } from '@context/types';
import { inquirerPrompt } from '../api';
import type { NpmPackageFile } from '../configs/types';
import { getContext } from '../context/provider';
import { chalk, logRaw, logWarning } from '../logger';
import { updatePackage } from './package';
import type { DependencyMutation } from './types';

export const createDependencyMutation = (opts: DependencyMutation) => {
    const ctx = getContext();
    ctx.mutations.pendingMutations.push(opts);
    ctx._requiresNpmInstall = true;
    return opts;
};

export const handleMutations = async (ctx: RnvContext) => {
    const mutations = ctx.mutations.pendingMutations;

    if (!mutations.length) return true;
    if (!ctx.runtime.isAppConfigured) {
        // We want to wait until we have appId loaded to have all merged dependencies
        // This is also needed to avoid multiple prompts where isTemplate is defined in appConfigs
        return false;
    }
    const isTemplate = ctx.buildConfig?.isTemplate;
    logWarning(
        `Updates to package.json are required:${isTemplate ? ' (only info. skipping due to template mode)' : ''}`
    );
    const msg = mutations.reduce(
        (acc, m) =>
            acc +
            `- ${chalk.bold.white(m.name)} (${chalk.red(m.original?.version || 'N/A')}) => (${chalk.green(
                m.updated.version
            )}) ${chalk.gray(`${m.msg} | ${m.source}`)}\n`,
        ''
    );
    logRaw(msg);
    if (isTemplate) return false;
    //Check with user
    const choices = [
        'Update package and install (recommended)',
        'Update package and skip install',
        'Continue without update or install'
    ];
    const { confirm } = await inquirerPrompt({
        name: 'confirm',
        type: 'list',
        default: choices[0],
        choices,
        message: 'What to do?'
    });

    ctx.mutations.pendingMutations = [];

    if (confirm === choices[2]) {
        // We skip the update and tell up stream to skip install
        return false;
    }

    const updateObj: NpmPackageFile = {};
    for (const m of mutations) {
        const dep = updateObj[m.type] || {};
        dep[m.name] = m.updated.version;
        updateObj[m.type] = dep;
    }

    updatePackage(updateObj);

    if (confirm === choices[1]) {
        // We update package but tell up stream to skip install
        return false;
    }
    return true;
};
