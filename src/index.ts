import OpenVPNConnection, { OpenVPNData } from './openvpn';
import WebServer from './webserver';

const openvpn = new OpenVPNConnection({
    host: process.env.OPENVPN_HOST,
    port: Number(process.env.OPENVPN_PORT) || 37505,
    // username: 'aaa',
    // password: 'aaa',
});

let openInterval;

function stopOpening(): void {
    if (openInterval)
        clearInterval(openInterval);
    openInterval = undefined;
}

function openUntilItDoes(): void {
    stopOpening();
    openInterval = setInterval(() => {
        stopOpening();
        openvpn.open();
    }, 5000);
}

openvpn.on('connect', stopOpening);
openvpn.on('close', openUntilItDoes);

(async (): Promise<void> => {

    const webserver = new WebServer({
        openvpn,
    });

    await webserver.start();

    openUntilItDoes();
})()
.catch((err) => { throw err; });

