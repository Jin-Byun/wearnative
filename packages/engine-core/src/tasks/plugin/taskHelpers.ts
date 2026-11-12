import { chalk, getContext, type PluginListResponse } from '@rnv/core';
import intersection from 'lodash/intersection';

export const getPluginList = (isUpdate = false) => {
    const c = getContext();

    const output: PluginListResponse = {
        asString: '',
        asArray: [],
        plugins: [],
        allPlugins: {} // this is used by taskPluginAdd
    };

    let i = 1;
    for (const { pluginTemplates: plugins } of Object.values(c.files.scopedConfigTemplates)) {
        if (!plugins) continue;

        for (const [k, plugin] of Object.entries(plugins)) {
            if (plugin === null || typeof plugin === 'string') continue;

            const platforms = intersection(
                c.runtime.supportedPlatforms.map((pl) => pl.platform),
                Object.keys(plugin)
            ).join(', ');
            const installedPlugin = c.buildConfig?.plugins?.[k];
            if (isUpdate) {
                if (!installedPlugin) {
                    output.allPlugins[k] = {
                        name: `${k} ${plugin.version}`,
                        value: k
                    };
                    continue;
                }

                const installedPluginVersion =
                    typeof installedPlugin !== 'string' ? installedPlugin.version : installedPlugin;
                const versionString = `${installedPluginVersion !== plugin.version ? `(${chalk.yellow(installedPluginVersion)}) => ` : ''}(${chalk.green(plugin.version)})`;
                output.asString += ` [${i}]> ${chalk.bold.white(k)} ${versionString}\n`;
                output.asArray.push({
                    name: `${k} ${versionString}`,
                    value: k
                });
            } else {
                const installedString = installedPlugin ? chalk.yellow('installed') : chalk.green('not installed');
                const keyNameString = `(${chalk.grey(
                    plugin.disableNpm ? '(no npm)' : plugin.version
                )}) [${platforms}] - ${installedString}`;
                output.asString += ` [${i}]> ${chalk.bold.white(k)} ${keyNameString}\n`;
                output.asArray.push({
                    name: `${k} ${keyNameString}`,
                    value: k
                });
            }
            output.plugins.push(k);
            i++;
        }
    }
    output.asArray.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return output;
};
