import { chalk, createTask, fsRenameSync, fsUnlinkSync, logInfo, RnvTaskName } from '@rnv/core';
import { getSourceDir, traverseTargetProject } from './linker';
import type { LinkablePackage } from './types';

const _unlinkPackage = (pkg: LinkablePackage) => {
    if (pkg.isBrokenLink) {
        logInfo(`${pkg.name} is a ${chalk.red('broken')} link. Attempting to fix...`);
        fsUnlinkSync(pkg.nmPath);
    } else if (pkg.isLinked && pkg.unlinkedPathExists) {
        fsUnlinkSync(pkg.nmPath);
        fsRenameSync(pkg.unlinkedPath, pkg.nmPath);
        logInfo(`${chalk.green('✔')} ${pkg.name} (${chalk.gray(pkg.nmPath)})`);
    } else if (!pkg.isLinked) {
        logInfo(`${pkg.name} is not linked. SKIPPING`);
    } else if (pkg.skipLinking) {
        logInfo(`${pkg.name} is set to skip linking. SKIPPING`);
    }
};

export default createTask({
    description: 'Replaces rnv version in project with original node_modules version',
    fn: async () => {
        const linkablePackages = traverseTargetProject(getSourceDir());

        let msg = 'Found following source packages:\n\n';

        linkablePackages.forEach((pkg) => {
            msg += `${pkg.nmPath.replace(pkg.name, chalk.bold.white(pkg.name))} ${
                pkg.isBrokenLink ? chalk.red('(broken)') : pkg.isLinked ? chalk.green('(linked)') : '(unlinked)'
            }\n`;
        });

        logInfo(msg);

        logInfo('Unlinking packages...');

        linkablePackages.forEach((pkg) => {
            _unlinkPackage(pkg);
        });

        return true;
    },
    task: RnvTaskName.unlink,
    isGlobalScope: true,
    ignoreEngines: true
});
