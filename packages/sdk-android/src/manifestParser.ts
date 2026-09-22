import path from 'node:path';
import {
    type ConfigAndroidManifest,
    type ConfigAndroidManifestNode,
    type ConfigAndroidResourcesNode,
    type ConfigTemplateAndroidBase,
    getConfigProp,
    getContext,
    getFlavouredProp,
    logDebug,
    logDefault,
    logError,
    logWarning,
    type OverridesOptions,
    parsePlugins,
    RnvFolderName,
    readObjectSync
} from '@rnv/core';
import { addSystemInjects, getAppId } from '@rnv/sdk-utils';
import type { Context } from './getContext';
import { createOverridesOption, writeParsedFiles } from './utils';

const PROHIBITED_DUPLICATE_TAGS = ['intent-filter'];
const SYSTEM_TAGS = ['tag', 'children'];

const _findChildNode = (tag: string, name: string, node: ConfigAndroidManifestNode | ConfigAndroidResourcesNode) => {
    if (!node) {
        logWarning('_findChildNode: Node is undefined');
        return;
    }
    if (!node.children) return null;
    if (PROHIBITED_DUPLICATE_TAGS.includes(tag)) {
        return node.children.find((ch) => ch?.tag === tag) || null;
    }
    if (!name) return null; // Can't determine reused child nodes without unique name identifier
    return (
        node.children.find((ch) => {
            return ch?.tag === tag && (('android:name' in ch && ch['android:name'] === name) || ch.name === name);
        }) || null
    );
};

export const _convertToXML = (manifestObj: ConfigAndroidManifestNode | ConfigAndroidResourcesNode) =>
    _parseNode(manifestObj, 0);

type NodeKeyChildren = keyof ConfigAndroidManifestNode['children'] | keyof ConfigAndroidResourcesNode['children'];

const _parseNode = <T extends ConfigAndroidManifestNode | ConfigAndroidResourcesNode>(n: T, level: number) => {
    if (!n.tag) {
        logWarning('Each node must have tag key!');
        return;
    }

    let output = '';
    const space = '    '.repeat(Math.max(0, level));
    const nodeKeys = Object.keys(n).filter((v) => !SYSTEM_TAGS.includes(v));
    const isSingleLine = nodeKeys.length < 2;
    const closedTag = 'value' in n;

    if (closedTag) {
        output += `${space}  <${n.tag} name="${(n as ConfigAndroidResourcesNode).name}">${n.value}`;
    } else {
        const endLine = isSingleLine ? ' ' : '\n';
        output += `${space}<${n.tag}${endLine}`;
        output += nodeKeys
            .map((k) => `${isSingleLine ? '' : `${space}  `}${k}="${n[k as keyof T]}"${endLine}`)
            .join('');
    }
    if (n.children?.length) {
        if (isSingleLine) {
            output += '>\n';
        } else {
            output += `${space}>\n`;
        }

        const nextLevel = level + 1;
        output += n.children.map((v) => _parseNode(v, nextLevel)).join('');
        output += `${space}</${n.tag}>\n`;
    } else {
        if (isSingleLine) {
            output += '/>\n';
        } else {
            output += !closedTag ? `${space}/>\n` : `</${n.tag}>\n`;
        }
    }
    return output;
};

export const _mergeNodeParameters = <T extends ConfigAndroidManifestNode | ConfigAndroidResourcesNode>(
    node: T | undefined,
    nodeParamsExt: T | undefined
) => {
    if (!nodeParamsExt) {
        logWarning('_mergeNodeParameters: nodeParamsExt value is null');
        return;
    }
    if (!node) {
        logWarning('_mergeNodeParameters: node value is null');
        return;
    }
    for (const [k, v] of Object.entries(nodeParamsExt)) {
        if (v === 'undefined' || SYSTEM_TAGS.includes(k)) continue;
        (node as T)[k as keyof T] = v;
    }
};

export const _mergeNodeChildren = <T extends ConfigAndroidManifestNode | ConfigAndroidResourcesNode>(
    node: T,
    nodeChildrenExt: Array<T> = []
) => {
    if (!node) {
        logWarning('_mergeNodeChildren: Node is undefined');
        return;
    }
    if (!nodeChildrenExt.length) return;
    if (!node.children) node.children = [];
    for (const nc of nodeChildrenExt) {
        if (!nc.tag) continue;
        const nameExt = 'android:name' in nc ? nc['android:name'] : nc.name;
        const childNode = _findChildNode(nc.tag, nameExt || '', node);
        if (childNode) {
            logDebug(`_mergeNodeChildren: FOUND EXISTING NODE TO MERGE ${nameExt} ${nc.tag}`);
            _mergeNodeParameters(childNode, nc);
            _mergeNodeChildren(childNode, nc.children);
        } else {
            logDebug(`_mergeNodeChildren: NO android:name found. adding to children ${nameExt} ${nc.tag}`);
            node.children.push(nc as NodeKeyChildren);
        }
    }
};

const _mergeFeatures = (
    c: Context,
    baseManifestFile: ConfigAndroidManifest,
    configKey: 'includedFeatures' | 'excludedFeatures',
    value: boolean
) => {
    const features = getConfigProp(configKey);

    if (features) {
        const featuresObj: Array<ConfigAndroidManifestNode> = [];
        features.forEach((key) => {
            featuresObj.push({
                tag: 'uses-feature',
                'android:name': key,
                'android:required': value
            });
        });
        _mergeNodeChildren(baseManifestFile, featuresObj);
    }
};

export const parseAndroidManifestSync = (objArr: (ConfigTemplateAndroidBase | undefined)[]) => {
    const c = getContext();
    logDefault('parseAndroidManifestSync');
    if (!c.platform) return;

    try {
        const baseManifestFilePath = path.join(
            __dirname,
            RnvFolderName.UP,
            RnvFolderName.templateFiles,
            `AndroidManifest_${c.platform}.json`
        );
        const baseManifestFile = readObjectSync<ConfigAndroidManifest>(baseManifestFilePath);
        if (!baseManifestFile) return;

        baseManifestFile.package = getAppId();
        // PARSE all standard renative.*.json files in correct mergeOrder
        for (const tpl of objArr) {
            const manifestObj = tpl?.AndroidManifest_xml;
            if (!manifestObj) continue;
            _mergeNodeParameters(baseManifestFile, manifestObj);
            _mergeNodeChildren(baseManifestFile, manifestObj.children);
        }

        // appConfigs/base/plugins.json PLUGIN CONFIG OVERRIDES
        parsePlugins((_plugin, pluginPlat) => {
            const ConfigAndroidManifestPlugin = getFlavouredProp(pluginPlat, 'templateAndroid')?.AndroidManifest_xml;
            _mergeNodeChildren(baseManifestFile, ConfigAndroidManifestPlugin?.children);
        });

        // appConfig PERMISSIONS OVERRIDES
        const configPermissions = c.buildConfig?.permissions;

        const includedPermissions = getConfigProp('includedPermissions');
        const excludedPermissions = getConfigProp('excludedPermissions');
        const platPerm = 'android'; //configPermissions[platform] ? platform : 'android';
        if (includedPermissions && configPermissions?.[platPerm]) {
            const pc = configPermissions[platPerm];
            const prePermissions =
                includedPermissions[0] === '*'
                    ? Object.keys(pc).filter((k) => !excludedPermissions?.includes(k))
                    : includedPermissions;
            const permissionsToAdd = prePermissions.flatMap((v) => {
                if (!pc[v]) return [];
                const key = pc[v].key || v;
                return {
                    tag: 'uses-permission',
                    'android:name': key
                };
            });
            if (permissionsToAdd.length) {
                if (!baseManifestFile.children) baseManifestFile.children = [];
                baseManifestFile.children.push(...permissionsToAdd);
            }
        } else if (includedPermissions) {
            logWarning('includedPermissions not parsed. make sure it an array format!');
        }

        // appConfig FEATURES OVERRIDES
        _mergeFeatures(c, baseManifestFile, 'includedFeatures', true);
        _mergeFeatures(c, baseManifestFile, 'excludedFeatures', false);

        const manifestXml = _convertToXML(baseManifestFile);
        const injects: OverridesOptions = [createOverridesOption('{{PLUGIN_MANIFEST_FILE}}', manifestXml || '')];
        addSystemInjects(injects);

        // get correct source of manifest
        const manifestFile = 'app/src/main/AndroidManifest.xml';
        writeParsedFiles(manifestFile, injects, c);
    } catch (e) {
        logError(e);
    }
};
