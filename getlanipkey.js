//var api = require('./fglairAPI.js');
const prompt = require("prompt-sync")({ sigint: true });

this.userName = prompt("FGLair account email address: ");
this.password = prompt("FGLair account password: ");


this.token = "";
this.serial = '';
this.region = 'us';
this.deviceIndex = 0;
this.deviceProperties = [];
var log = console.log;
this.api = require('./fglairAPI.js')

this.api.setRegion(this.token);
this.lanipkey = null;

    this.updateAll = function(ctx) {
        ctx.api.getDeviceProp(ctx.serial, (err, properties) => {
            if (err) {
                log("Update Properties: " + err.message);
            } else {
                properties.forEach((prop) => {
                    //log(prop['property']['name'] + " = " + prop['property']['value']);
                }); //end of foreach
            }

        });
        ctx.api.getDeviceLanIp(ctx.serial, (err, properties) => {
            if (err) {
                log("Update Properties: " + err.message);
            } else {
                    this.lanipkey = properties['lanip']['lanip_key'];
                    log("Your Lan IP key is " + this.lanipkey);
            }

        });
    }


this.api.getAuth(this.userName ,this.password, (err, token) =>
	{
		this.token = token;

		this.api.getDevices(token, (err,data) =>
		{
			if( err)
			{
			   //TODO:  Do something...
			}
			else
			{
				this.serial = data[this.deviceIndex];
				log("device serial for " + this.deviceIndex + ": " + this.serial);
				this.updateAll(this);
				//log("updated all for " + this.deviceIndex);
			}
		});


	});

