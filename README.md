# homebridge-fujitsu-local
## Homebridge plug in for Fujistu Mini Split controlled locally using the device lan ip key and a local HTTP server running in node

**Warning** this plugin this is currently experimental, use at your own risk!

## Installation

1. Install this plugin: `npm install -g homebridge-fujitsu-local
2. Run the node node_modules/homebridge-fujitsu-local/getlanipkey.js to find your lan ip key (and make note of it)
3. Edit your configuration. Enter the lan ip key and the ac unit ip address or hostname. enter the local ip address of the homebridge instance and a free local port for the ac to connect to when it wants to push info back to homebridge.

{
    "name": "Fujitsu Local",
    "lanipkey": "FROM STEP 2",
    "unithostname": "x.x.x.x",
    "localserverip": "x.x.x.x",
    "localserverport": "9016",
    "accessory": "FGLairThermostatLocal"
}



