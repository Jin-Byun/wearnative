import { getConfigProp } from '../context/contextProps';
import type { RnvContext } from '../context/types';
import type { ConfigPropKey } from '../schema/types';
import type { OverridesOptions } from './types';

const INJECTABLE_RUNTIME_PROPS = ['appId', 'scheme', 'timestamp', 'localhost', 'target', 'port'] as const;

const INJECTABLE_CONFIG_PROPS: Array<ConfigPropKey> = [
    'id',
    'title',
    'entryFile',
    'backgroundColor',
    'scheme',
    'teamID',
    'provisioningStyle',
    'bundleAssets',
    'multipleAPKs',
    'pagesDir'
];

export const generateConfigPropInjects = (c: RnvContext) => {
    if (!c.injectableConfigProps) c.injectableConfigProps = {};
    c.configPropsInjects = INJECTABLE_CONFIG_PROPS.map((key) => {
        const configProp = getConfigProp(key);
        c.injectableConfigProps[key] = configProp;
        return {
            pattern: `{{configProps.${key}}}`,
            override: configProp
        };
    });
};

export const generateRuntimePropInjects = (rt: RnvContext['runtime']): OverridesOptions =>
    INJECTABLE_RUNTIME_PROPS.map((key) => ({
        pattern: `{{runtimeProps.${key}}}`,
        override: rt[key]
    }));
