import * as _shared from './shared';
import * as _common from './common';
import * as _plugins from './plugins';
import * as _base from './plugins/fragments/base';
import * as _pAndroid from './plugins/fragments/platformAndroid';
import * as _pIos from './plugins/fragments/platformIos';
import * as _pBase from './plugins/fragments/platformBase';
import * as _platforms from './platforms';
import * as _platformsFragmentsAndroid from './platforms/fragments/android';
import * as _platformsFragmentsIos from './platforms/fragments/ios';
import * as _platformsFragmentsBase from './platforms/fragments/base';
import * as _platformsFragmentsLightning from './platforms/fragments/lightning';
import * as _platformsFragmentsNextJs from './platforms/fragments/nextjs';
import * as _platformsFragmentsWeb from './platforms/fragments/web';
import * as _platformsFragmentsTizen from './platforms/fragments/tizen';
import * as _platformsFragmentsReactNative from './platforms/fragments/reactNative';
import * as _platformsFragmentsWindows from './platforms/fragments/windows';
import * as _platformsFragmentsTemplateAndroid from './platforms/fragments/templateAndroid';
import * as _platformsFragmentsTemplateXcode from './platforms/fragments/templateXcode';
import * as _platformsFragmentsElectron from './platforms/fragments/electron';
import * as _platformsFragmentsWebos from './platforms/fragments/webos';
import * as _root from './configFiles/root';

export const ZodFileSchema = {
    zodConfigFileRoot: _root.zodConfigFileRoot,
};

export const ZodSharedSchema = {
    _shared,
    _common,
    _plugins,
    _base,
    _pAndroid,
    _pIos,
    _pBase,
    _platforms,
    _platformsFragmentsAndroid,
    _platformsFragmentsIos,
    _platformsFragmentsBase,
    _platformsFragmentsLightning,
    _platformsFragmentsNextJs,
    _platformsFragmentsWeb,
    _platformsFragmentsTizen,
    _platformsFragmentsReactNative,
    _platformsFragmentsWindows,
    _platformsFragmentsTemplateAndroid,
    _platformsFragmentsTemplateXcode,
    _platformsFragmentsElectron,
    _platformsFragmentsWebos,
};
