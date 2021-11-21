import EventEmitter from 'events';
import { createConnection, Socket, TcpSocketConnectOpts } from 'net';
import { isNullOrUndefined } from 'node:util';
import { resolve } from 'path';
import split2 from 'split2';
import log from './log';

export type OpenVPNOptions = {
    timeout: number;
    logpath?: string;
    username?: string;
    password?: string;
}

export type OpenVPNTelnetConnectionOptions = TcpSocketConnectOpts & OpenVPNOptions;
 
export default class OpenVPNTelnetConnection extends EventEmitter {
    
    protected options: TcpSocketConnectOpts & OpenVPNOptions;
    private connection: Socket;

    constructor(options: Partial<OpenVPNTelnetConnectionOptions>) {
        super();

        this.options = {
            host: '127.0.0.1',
            port: 1337,
            timeout: 1500,
            logpath: resolve(__dirname, 'log.txt'),
            ...options,
        }
    }
    
    public openRawConnection(): Promise<void> {
        return new Promise<void>(async (res, rej) => {

            try {
                this.connection = createConnection(
                    {
                        ...this.options,
                        allowHalfOpen: false,
                        readable: true,
                        writable: true,
                    },
                    () => { res();},
                );
            }
            catch (err) { // timeout error
                rej(err);
                this.emit('error', err);
            }

            this.connection
                .pipe(split2())
                .on('data', (data: Buffer) => {
                    const str = data.toString('utf8')
                    log.openvpn.debug(`received from socket: ${str}`);
                    this.emit('data', str);
                })
                .on('close', () => {
                    // destroy the socket stream in case the split stream was destroyed
                    this.connection.destroy();
                });

                this.connection.on('end', () => {
                    log.openvpn.warn('received socket end');
                    this.emit('end');
                });

                // this.connection.on('data', (data) => {
                //     console.dir('data');
                //     // this.emit('end');
                // });

            this.connection.once('close', () => {
                rej(new Error('Telnet connection closed'));
            });

            this.connection.on('close', () => {                
                log.openvpn.warn('socket closed');
                this.emit('close');
            });

            this.connection.once('error', (err: string) => {                
                rej(err);
            });

            this.connection.on('error', (err: string) => {
                log.openvpn.error(`socket error ${err}`);
                this.emit('error', err);
            });
        });
    }

    public assertOpen(skipWritableCheck: boolean = false): void {
        if (!this.connection) {
            log.openvpn.error('Connection is closed');
            throw new Error('Connection is closed');
        }

        if (!skipWritableCheck && !this.connection.writable) {
            log.openvpn.error('Cannot write to socket as it\'s not writeable');
            throw new Error('Connection is not writeable');
        }
    }
    
    public async send(
        text: string, 
        waitForResponse?: RegExp, 
        errorMessage?: string
    ): Promise<string> {
        this.assertOpen();

        await this.connection.write(text + '\r\n');

        if (isNullOrUndefined(waitForResponse))
            return;
        
        return this.waitForReponse(waitForResponse, errorMessage);
    }

    public waitForReponse(match: RegExp, errorMessage?: string): Promise<string> {
        
        if (!isNullOrUndefined(errorMessage))
            errorMessage += ': ';

        return new Promise((res, rej) => {
            setTimeout(
                () => {
                    this.off('data', onData);
                    rej(new Error(errorMessage + 'Timed out waiting for response'));
                }, 
                this.options.timeout,
            );

            const accumulator: string[] = [];
            function onData(line: string) {
                accumulator.push(line);
                const m = line.match(match);
                if (m) {
                    if (m.length > 1) {
                        accumulator.pop();
                        accumulator.push(m[1]);
                    }
                    this.off('data', onData);
                    res(accumulator.join('\r\n'));
                }
            }

            this.on('data', onData);
            this.once('end', () => {
                this.off('data', onData);
                rej(new Error(errorMessage + 'Connection closed while waiting for response'));
            });
        });
    }

    public on(event: 'data', listener: (line: string) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }
}
