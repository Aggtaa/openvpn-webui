import debug, { ExtendedDebug } from 'debug-threads-ns';

type Log = ExtendedDebug & {
    openvpn: ExtendedDebug;
    web: ExtendedDebug;
}

export default debug('monitor') as Log;
