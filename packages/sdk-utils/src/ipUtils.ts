import os from 'node:os';
import { chalk, DEFAULTS, getConfigProp, getContext, inquirerPrompt, isSystemWin, logDefault } from '@rnv/core';
import { detect } from 'detect-port';
import { killPort } from 'kill-the-port';

export const confirmActiveBundler = async () => {
    const c = getContext();
    if (c.runtime.skipActiveServerCheck) return true;
    const { port } = c.runtime;

    if (c.program.opts().ci) {
        //TODO: handle return codes properly
        await killPort({ port });
        return true;
    }

    const choices = ['Restart the server (recommended)', 'Use existing session'];

    const { selectedOption } = await inquirerPrompt({
        name: 'selectedOption',
        type: 'list',
        choices,
        warningMessage: `Another ${c.platform} server at port ${chalk.bold.white(port)} already running`
    });

    if (choices[0] !== selectedOption) {
        return false;
    }
    await killPort({ port });
    return true;
};

const getDevServerHost = () => {
    const devServerHost0 = getConfigProp('devServerHost');
    const localhost = getContext().runtime.localhost || DEFAULTS.devServerHost;
    if (!devServerHost0 || typeof devServerHost0 !== 'string') return localhost;
    if (['localhost', '0.0.0.0', '127.0.0.1'].includes(devServerHost0)) return localhost;
    return devServerHost0;
};

export const waitForHost = async (
    suffix = 'assets/bundle.js',
    opts?: { maxAttempts: number; checkInterval: number }
) => {
    const c = getContext();
    logDefault('waitForHost', `port:${c.runtime.port}`);
    let attempts = 0;
    const maxAttempts = opts?.maxAttempts || 10;
    const CHECK_INTEVAL = opts?.checkInterval || 2000;

    const devServerHost = getDevServerHost();
    const url = `http://${devServerHost}:${c.runtime.port}/${suffix}`;

    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            if (attempts > maxAttempts) {
                clearInterval(interval);
                return reject(`Can't connect to host ${url}. Try restarting it.`);
            }
            fetch(url)
                .then((res) => {
                    if (res.status === 200) {
                        clearInterval(interval);
                        return resolve(true);
                    }
                })
                .catch(() => {})
                .finally(() => {
                    attempts++;
                });
        }, CHECK_INTEVAL);
    });
};

export const checkPortInUse = (port: number) =>
    new Promise((resolve, reject) => {
        if (port === undefined || port === null) {
            return resolve(false);
        }
        detect(port)
            .then((realPort) => {
                resolve(port !== realPort);
            })
            .catch((err) => {
                reject(err);
            });
    });

const ipFromLong = (longIp: number) =>
    `${longIp >>> 24}.${(longIp >> 16) & 255}.${(longIp >> 8) & 255}.${longIp & 255}`;

const isLoopback = (address: string) => {
    // convert ipv4 ip if it's in a long form
    if (!/\./.test(address) && !/:/.test(address)) {
        address = ipFromLong(Number(address));
    }

    return (
        /^(::f{4}:)?127\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})/.test(address) ||
        /^0177\./.test(address) ||
        /^0x7f\./i.test(address) ||
        /^fe80::1$/i.test(address) ||
        /^::1$/.test(address) ||
        /^::$/.test(address)
    );
};

export const getIP = () => {
    const interfaces = os.networkInterfaces();

    const all = Object.values(interfaces).flatMap(
        (netIntInfoValue) =>
            netIntInfoValue?.find((netIntInfo) => netIntInfo.family === 'IPv4' && !isLoopback(netIntInfo.address))
                ?.address ?? []
    );
    return all[Number(isSystemWin && all.length > 1)] ?? '127.0.0.1';
};
