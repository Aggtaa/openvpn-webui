import express, { Express, Request, Response } from 'express';
import hbs from 'express-hbs';
import { join } from 'path';
import { DateTime } from 'luxon';
import debug from 'debug';
import OpenVPNConnection from './openvpn';
import log from './log';

export type WebServerOptions = {
    openvpn: OpenVPNConnection;
    host: string;
    port: number;
}

export default class WebServer {
    
    private readonly options: WebServerOptions;
    private app: Express;

    constructor(options: Pick<WebServerOptions, 'openvpn'> & Partial<WebServerOptions>) {
        this.options = {
            host: process.env.HOST || '0.0.0.0',
            port: Number(process.env.PORT) || 38087,
            ...options,
        };

        this.app = express();
        this.app.disable('x-powered-by');

        this.app.engine(
            'hbs', // eslint-disable-line i18next/no-literal-string
            hbs.express4({
                // layoutsDir: 'src/layouts', // eslint-disable-line i18next/no-literal-string
                contentHelperName: 'set', // eslint-disable-line i18next/no-literal-string
            }),
        );
        // eslint-disable-next-line i18next/no-literal-string
        this.app.set('view engine', 'hbs');
        // eslint-disable-next-line i18next/no-literal-string
        this.app.set('views', 'src/views');

        hbs.registerHelper('json', (d: unknown) => JSON.stringify(d, undefined, 2));
        hbs.registerHelper('dateTime', (dt: unknown) => DateTime.fromJSDate(dt).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS));        hbs.registerHelper('bytes', (bytes: number) => {
            if (bytes > 1024 * 1024)
                return `${Math.round(bytes / (1024 * 1024) * 10) / 10}M`;
            if (bytes > 1024)
                return `${Math.round(bytes / 1024 * 10) / 10}K`;
            return `${bytes}`;
        });

        this.app.get('/', (req, res) => this.getIndex(req, res));

        this.app.use(express.static(join(__dirname, 'static')));
    }

    public start(): Promise<void> {
        return new Promise((res) => {
            this.app.listen(this.options.port, this.options.host, () => {
                log.web.info(`web server started at ${this.options.host}:${this.options.port}`);
                res();
            });
        });
    }

    private async getIndex(req: Request, res: Response): Promise<void> {
        log.web.debug('rendering index page');

        try {
            await this.options.openvpn.refresh();

            res.render('index', { openvpn: this.options.openvpn.data });
        }
        catch (err) { 
            log.web.error(err);
            res.render('error');
        }
    }
}
