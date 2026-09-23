import { isPlatformAndroidwear } from '@rnv/renative';
import { createContext, useState } from 'react';
import { type ImageStyle, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import ICON_LOGO from '../appConfigs/base/assets/runtime/logo.png';

const getFlexShrinkPropertyValue = () => 1 - Number(isPlatformAndroidwear);
type CustomStyleView = ViewStyle & { outline?: string };
interface ThemeInterface {
    theme: {
        static: {
            primaryFontFamily: string;
            iconSize: number;
            buttonSize: number;
            colorLight: string;
            colorBrand: string;
            colorBgPrimary: string;
            colorTextPrimary: string;
            colorTextSecondary: string;
        };
        styles: {
            wrapper: ViewStyle;
            container: ViewStyle;
            textH2: TextStyle;
            textH3: TextStyle;
            image: ImageStyle;
            button: CustomStyleView;
            focusedButton: CustomStyleView;
            buttonText: TextStyle;
            scrollView: ViewStyle;
        };
    };
    dark: boolean;
    toggle: () => void;
}
const createStyleSheet = (currentTheme: ThemeInterface['theme']['static']) =>
    StyleSheet.create({
        wrapper: {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            backgroundColor: currentTheme.colorBgPrimary,
            justifyContent: 'center',
            display: 'flex',
            alignItems: 'center'
        },
        scrollView: {
            flexGrow: 0,
            width: '100%'
        },
        container: {
            flexShrink: getFlexShrinkPropertyValue(),
            alignItems: 'center',
            paddingVertical: 10,
            minHeight: 'auto',
            alignSelf: 'stretch',
            backgroundColor: currentTheme.colorBgPrimary
        },
        textH2: {
            fontFamily: currentTheme.primaryFontFamily,
            fontSize: 20,
            marginHorizontal: 20,
            color: currentTheme.colorTextPrimary,
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center'
        },
        textH3: {
            fontFamily: currentTheme.primaryFontFamily,
            fontSize: 15,
            marginHorizontal: 20,
            marginTop: 5,
            color: currentTheme.colorTextSecondary,
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center'
        },
        image: {
            marginBottom: 30,
            width: 93,
            height: 9
        },
        button: {
            margin: 10,
            padding: 10,
            backgroundColor: currentTheme.colorBrand,
            borderRadius: 10,
            outline: 'none'
        } as CustomStyleView,
        focusedButton: {
            opacity: 0.8
        } as CustomStyleView,
        buttonText: {
            fontFamily: currentTheme.primaryFontFamily,
            fontSize: 15,
            color: currentTheme.colorLight
        }
    });

const baseTheme: Pick<
    ThemeInterface['theme']['static'],
    'primaryFontFamily' | 'iconSize' | 'buttonSize' | 'colorLight' | 'colorBrand'
> = {
    primaryFontFamily: 'Inter-Light',
    iconSize: 20,
    buttonSize: 30,
    colorLight: '#FFFFFF',
    colorBrand: '#0A74E6'
};

const staticThemes: Record<string, ThemeInterface['theme']['static']> = {
    dark: Object.assign(Object.create(baseTheme), {
        colorBgPrimary: '#000000',
        colorTextPrimary: '#FFFFFF',
        colorTextSecondary: '#AAAAAA'
    }),
    light: Object.assign(Object.create(baseTheme), {
        colorBgPrimary: '#FFFFFF',
        colorTextPrimary: '#000000',
        colorTextSecondary: '#333333'
    })
};

const themes = {
    light: {
        static: staticThemes.light,
        styles: createStyleSheet(staticThemes.light)
    },
    dark: {
        static: staticThemes.dark,
        styles: createStyleSheet(staticThemes.dark)
    }
};

export function testProps(testId: string | undefined) {
    if (!testId) return;
    return { accessibilityLabel: testId, accessible: true };
}

export const ThemeContext = createContext<ThemeInterface>({
    theme: themes.dark,
    dark: false,
    toggle: () => {}
});

export function ThemeProvider({ children }) {
    const [dark, setDark] = useState(false);
    const toggle = () => setDark(!dark);
    const theme = dark ? themes.dark : themes.light;

    return <ThemeContext.Provider value={{ theme, dark, toggle }}>{children}</ThemeContext.Provider>;
}

export const themeStyles = themes.dark.styles;
const CONFIG = {
    welcomeMessage: 'Hello wearNative!'
};

export { CONFIG, ICON_LOGO };

export default staticThemes.dark;
