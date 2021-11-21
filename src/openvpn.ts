import OpenVPNTelnetConnection, { OpenVPNTelnetConnectionOptions } from './telnet';

export { OpenVPNTelnetConnectionOptions as OpenVPNConnectionOptions } from './telnet';

export type OpenVPNClientData = {
    'CommonName': string,
    'RealAddress': string,
    'VirtualAddress': string,
    'VirtualIPv6Address': string,
    'BytesReceived': number,
    'BytesSent': number,
    'ConnectedSince': Date,
    // 'Connected Since (time_t)': '1637350228',
    Username: string,
    'ClientID': number,
    'PeerID': number,
}

export type OpenVPNRouteData = {
    VirtualAddress: string,
    CommonName: string,
    RealAddress: string,
    LastRef: Date,
}

export type OpenVPNData = {
    host: string;
    pid: number;
    title: string;
    time: Date;
    clients: Record<string, OpenVPNClientData>;
    routes: Record<string, OpenVPNRouteData>;
    load: {
        clientCount: number,
        bytesReceived: number,
        bytesSent: number,
    },
}

export default class OpenVPNConnection extends OpenVPNTelnetConnection {
    
    public data: Partial<OpenVPNData>;

    constructor(options: Partial<OpenVPNTelnetConnectionOptions>) {
        super(options);
        this.data = {
            host: this.options.host,
        };
    }

    public async open(): Promise<string> {
        await this.openRawConnection();

        const info = await this.waitForReponse(/^>INFO:/, 'Error while waiting for welcome info');  

        // await this.refresh();

        return info;
    }

    public async refresh(): Promise<void> {
        await this.getPID();
        await this.getStatus();      
        await this.getLoadStats();
    }

    public async getPID(): Promise<number> {
        const pidStr = await this.send('pid', /^SUCCESS: pid=(.+)$/, 'Error getting PID');
        const pid = Number(pidStr);
        if (Number.isNaN(pid))
            throw new Error(`Expected numeric PID. Got "${pidStr}"`);
        this.data.pid = pid;
        this.emit('change', this.data);
        return this.data.pid;
    }

    public async getStatus(): Promise<void> {
        const status = await this.send('status 2', /^END$/, 'Error getting status');

        const data = status.split('\r\n').map((l) => l.split(','));

        this.data.title = data.find(([name]) => name === 'TITLE')[1];
        this.data.time = new Date(Number(data.find(([name]) => name === 'TIME')[2]) * 1000);

        this.data.clients = {};
        const clientsHeader = data.find(([name, type]) => name === 'HEADER' && type === 'CLIENT_LIST').slice(2).map((l) => l.replace(/ /g, ''));
        for (const line of data.filter(([name]) => name === 'CLIENT_LIST')) {
            const client = {} as unknown as OpenVPNClientData;
            line.slice(1).forEach((v, i) => { client[clientsHeader[i]] = v; });
            client['ClientID'] = Number(client['ClientID']);
            client['ConnectedSince'] = new Date(Number(client['ConnectedSince(time_t)']) * 1000);
            client['BytesReceived'] = Number(client['BytesReceived']);
            client['BytesSent'] = Number(client['BytesSent']);
            this.data.clients[client['ClientID']] = client;
            delete(client['ConnectedSince(time_t)']);
        }

        this.data.routes = {};
        const routesHeader = data.find(([name, type]) => name === 'HEADER' && type === 'ROUTING_TABLE').slice(2).map((l) => l.replace(/ /g, ''));
        for (const line of data.filter(([name]) => name === 'ROUTING_TABLE')) {
            const route = {} as unknown as OpenVPNRouteData;
            line.slice(1).forEach((v, i) => { route[routesHeader[i]] = v; });
            route['LastRef'] = new Date(Number(route['LastRef(time_t)']) * 1000);
            this.data.routes[route['CommonName']] = route;
            delete(route['LastRef(time_t)']);
        }

        this.emit('change', this.data);
    }

    public async getLoadStats(): Promise<void> {
        const load = Object.fromEntries((await this.send(
            'load-stats', 
            /^SUCCESS: (.+)$/, 
            'Error getting load stats'
        )).split(',').map((l) => l.split('=')));

        this.data.load = {
            clientCount: Number(load.nclients),
            bytesReceived: Number(load.bytesin),
            bytesSent: Number(load.bytesout),
        };

        this.emit('change', this.data);
    }

    // public on(event: 'change', listener: (data: Partial<OpenVPNData>) => void): this;
    // public on(event: string | symbol, listener: (...args: any[]) => void): this {
    //     return super.on(event, listener);
    // }
}