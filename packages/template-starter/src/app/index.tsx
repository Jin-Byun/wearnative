import { Api } from '@rnv/renative';
import { type ElementRef, use, useRef } from 'react';
import { Image, ScrollView, StatusBar, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import packageJson from '../../package.json';
import { CONFIG, ICON_LOGO, ThemeContext, ThemeProvider, testProps } from '../config';

const App = () => (
    <ThemeProvider>
        <AppThemed />
    </ThemeProvider>
);

const AppThemed = () => {
    const buttonRef = useRef<ElementRef<typeof TouchableOpacity>>(null);
    const { theme, toggle, dark } = use(ThemeContext);
    const { scale: pixelRatio, fontScale } = useWindowDimensions();
    const isClient = true;

    return (
        <View style={theme.styles.wrapper}>
            <ScrollView style={theme.styles.scrollView} contentContainerStyle={theme.styles.container}>
                <StatusBar
                    backgroundColor={theme.styles.container.backgroundColor}
                    barStyle={dark ? 'light-content' : 'dark-content'}
                />
                <Image
                    style={theme.styles.image}
                    source={ICON_LOGO}
                    {...testProps('template-starter-home-screen-renative-image')}
                />
                <Text style={theme.styles.textH2} {...testProps('template-starter-home-screen-welcome-message-text')}>
                    {CONFIG.welcomeMessage}
                </Text>
                <Text style={theme.styles.textH2} {...testProps('template-starter-home-screen-version-number-text')}>
                    v {packageJson.version}
                </Text>
                {isClient ? (
                    <Text style={theme.styles.textH3}>
                        {`platform: ${Api.platform}, factor: ${Api.formFactor}, engine: ${Api.engine}`}
                    </Text>
                ) : null}
                <Text style={theme.styles.textH3}>{`hermes: ${
                    typeof HermesInternal === 'object' && HermesInternal !== null ? 'yes' : 'no'
                }`}</Text>
                <Text style={theme.styles.textH3}>{`pixelRatio: ${pixelRatio}, ${fontScale}`}</Text>
                <TouchableOpacity
                    ref={buttonRef}
                    onPress={toggle}
                    style={theme.styles.button}
                    {...testProps('template-starter-home-screen-try-my-button')}
                >
                    <Text style={theme.styles.buttonText}>Try me!</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};

export default App;
