// FGLair API, (c) 2022 Jean-Philippe Lord, MIT License

// Portions of this software adapted from the homebridge-thermostat project
// https://github.com/PJCzx/homebridge-thermostat/
// Licensed under Apache 2.0

var Service, Characteristic, HbAPI;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HbAPI = homebridge;
    homebridge.registerAccessory("homebridge-fujitsu-local", "FGLairThermostatLocal", Thermostat);
};

const OPERATION_MODE = {
    "off": 0,
    "auto": 2,
    "cool": 3,
    "dry": 4,
    "fan_only": 5,
    "heat": 6,
    0: "off",
    2: "auto",
    3: "cool",
    4: "dry",
    5: "fan_only",
    6: "heat"
}

const HK_MODE = {
    0: "off",
    1: "heat",
    2: "cool",
    3: "auto"
}

const FJ_FAN_QUIET = 0;
const FJ_FAN_LOW = 1;
const FJ_FAN_MEDIUM = 2;
const FJ_FAN_HIGH = 3;
const FJ_FAN_AUTO = 4;

//const HK_FAN_QUIET = 20;
//const HK_FAN_LOW = 50;
//const HK_FAN_MEDIUM = 80;
//const HK_FAN_HIGH = 100;

const HK_FAN_AUTO = 0;
const HK_FAN_QUIET = 1;
const HK_FAN_LOW = 2;
const HK_FAN_MEDIUM = 3;
const HK_FAN_HIGH = 4;

const FANFJ2HK = { [FJ_FAN_QUIET]: HK_FAN_QUIET, [FJ_FAN_LOW]: HK_FAN_LOW, [FJ_FAN_MEDIUM]: HK_FAN_MEDIUM, [FJ_FAN_HIGH]: HK_FAN_HIGH };
const FANHK2FJ = { [HK_FAN_AUTO]: FJ_FAN_AUTO, [HK_FAN_QUIET]: FJ_FAN_QUIET, [HK_FAN_LOW]: FJ_FAN_LOW, [HK_FAN_MEDIUM]: FJ_FAN_MEDIUM, [HK_FAN_HIGH]: FJ_FAN_HIGH };


function Thermostat(log, config) {
    this.log = log;

    this.name = config.name;
    this.manufacturer = "Fujitsu General Ltd.";
    this.model = config.model || "DefaultModel";
    this.serial = config.serial || '';
    this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
    this.deviceIndex = config.deviceIndex || 0;

    this.currentHumidity = config.currentHumidity || false;
    this.targetHumidity = config.targetHumidity || false;
    this.lanipkey = config.lanipkey || '';
    this.unithostname = config.unithostname || '';
    this.localserverip = config.localserverip || '';
    this.localserverport = config.localserverport || '';
    this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
    this.targetTemperature = 20;
    this.keyTargetTemperature = 0;
    this.currentTemperature = 20;

    this.dryswitchstate = 0;
    this.fanactive = 0;
    this.fanswingmode = 0;
    this.fanrotationspeed = 0;
    this.fantargetfanstate = 0;

    this.fgoperationmode = 0;

    this.targetHeatingCoolingState = 0;
    this.keyCurrentHeatingCoolingState = 0;
    this.currentHeatingCoolingState = 0;

    this.deviceProperties = [];

    this.log(this.name);
    this.service = new Service.Thermostat(this.name);
    this.dryswitch = new Service.Switch(this.name + " Dry Override")
    this.fan = new Service.Fanv2(this.name + " Fan1")
    this.informationService = new Service.AccessoryInformation();
    this.api = require('./fglairAPI.js')
    this.api.setLog(this.log);



    this.api.createServer(this.localserverip, this.localserverport, this.lanipkey, this.unithostname, (err, url, updatedata) => {
        this.updateprop(this, updatedata);
    });

    this.api.keepaliveLocal(true, this.unithostname, this.localserverip, this.localserverport);

    setInterval(this.api.keepaliveLocal, 1000 * 10, false, this.unithostname, this.localserverip, this.localserverport);

    this.updateprop = function(ctx, updatedata) {

        //ctx.log(prop['property']['name'] + prop['property']['value']);
        prop = JSON.parse(updatedata);
        //ctx.log(prop);

        if (prop['data']['name'] == 'adjust_temperature') {
            if (prop['data']['value'] == 65535) {
                 ctx.targetTemperature =  20;
            } else {
                ctx.targetTemperature = parseInt(prop['data']['value']) / 10;
            }
            //ctx.currentTemperature = ctx.targetTemperature;
            //ctx.log("[" + ctx.serial + "] Got Temperature: "+ ctx.targetTemperature + ":" + ctx.currentTemperature);
            ctx.service.updateCharacteristic(Characteristic.TargetTemperature, ctx.targetTemperature);
            //ctx.service.updateCharacteristic(Characteristic.CurrentTemperature, ctx.currentTemperature);
            //ctx.keyTargetTemperature = prop['property']['key'];
            ctx.currentHeatingCoolingState = this.simulatecurrentstate(this);
            ctx.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, ctx.currentHeatingCoolingState);
        }

        if (prop['data']['name'] == 'display_temperature') {
            //ctx.currentTemperature = Math.ceil((((parseInt(prop['data']['value']) / 100.00) - 32) * 5 / 9) * 2) / 2;
            ctx.currentTemperature = Math.ceil((((parseInt(prop['data']['value']) / 100.00) - 50) ) * 2) / 2;
            ctx.service.updateCharacteristic(Characteristic.CurrentTemperature, ctx.currentTemperature);
            ctx.currentHeatingCoolingState = this.simulatecurrentstate(this);
            ctx.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, ctx.currentHeatingCoolingState);
        }

        if (prop['data']['name'] == 'fan_speed') {
            if (prop['data']['value'] == FJ_FAN_AUTO) {
                ctx.fantargetfanstate = Characteristic.TargetFanState.AUTO;
                ctx.fanrotationspeed = 0;
                ctx.fanactive = Characteristic.Active.INACTIVE;
            } else {
                ctx.fantargetfanstate = Characteristic.TargetFanState.MANUAL;
                ctx.fanrotationspeed = FANFJ2HK[prop['data']['value']];
                ctx.fanactive = Characteristic.Active.ACTIVE;
            }
            ctx.fan.updateCharacteristic(Characteristic.RotationSpeed, ctx.fanrotationspeed);
            ctx.fan.updateCharacteristic(Characteristic.TargetFanState, ctx.fantargetfanstate);
            ctx.fan.updateCharacteristic(Characteristic.Active, ctx.fanactive);
        }

        if (prop['data']['name'] == 'af_vertical_swing') {
            if (prop['data']['value'] == 1) {
                ctx.fanswingmode = Characteristic.SwingMode.SWING_ENABLED;
            } else {
                ctx.fanswingmode = Characteristic.SwingMode.SWING_DISABLED;
            }
            ctx.fan.updateCharacteristic(Characteristic.SwingMode, ctx.fanswingmode);
        }

        if (prop['data']['name'] == 'operation_mode') {

            let mode = OPERATION_MODE[prop['data']['value']];
            switch (mode) {
                case "off":
                    ctx.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
                    ctx.fan.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE);
                    break;
                case "auto":
                    ctx.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;
                    break;
                case "heat":
                    ctx.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.HEAT;
                    break;
                case "fan_only":
                    ctx.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
                    break;
                case "cool":
                    ctx.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.COOL;
                    ctx.dryswitchstate = false;
                    break;
                case "dry":
                    ctx.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.COOL;
                    ctx.dryswitchstate = true;
                    break;
                default:
                    ctx.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
                    break;
            }
            switch (mode) {
                case "off":
                case "fan_only":
                    ctx.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
                    break;
                case "heat":
                    ctx.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.HEAT;
                    break;
                case "cool":
                    ctx.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.COOL;
                    break;
                default:
                    ctx.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
                    break;
            }
            // set this var to keep track of modes not supported by HK
            this.fgoperationmode = prop['data']['value'];
            //ctx.keyCurrentHeatingCoolingState = prop['property']['key'];
            //ctx.log("[" + ctx.serial + "] Got HeatingCooling State: "+ ctx.targetHeatingCoolingState);
            //ctx.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, ctx.currentHeatingCoolingState);
            ctx.service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, ctx.targetHeatingCoolingState);
            ctx.currentHeatingCoolingState = this.simulatecurrentstate(this);
            ctx.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, ctx.currentHeatingCoolingState);
            ctx.dryswitch.updateCharacteristic(Characteristic.On, ctx.dryswitchstate);
        }

        ctx.log("Fujutsu AC settemp: " + ctx.targetTemperature + "C, ambient: " + ctx.currentTemperature + "C, Tmode: " + HK_MODE[ctx.targetHeatingCoolingState] + " Cmode: " +  HK_MODE[ctx.currentHeatingCoolingState]);


    };


    this.simulatecurrentstate = function(ctx) {
       let resultstate;
       switch (HK_MODE[ctx.targetHeatingCoolingState]) {
           case "cool":
           case "dry":
               if ( ctx.currentTemperature >= ctx.targetTemperature ) {
                   resultstate = Characteristic.CurrentHeatingCoolingState.COOL;
               } else {
                   resultstate = Characteristic.CurrentHeatingCoolingState.OFF;
               }
           break;
           case "fan":
               resultstate = Characteristic.CurrentHeatingCoolingState.COOL;
           case "heat":
               if ( ctx.currentTemperature <= ctx.targetTemperature ) {
                   resultstate = Characteristic.CurrentHeatingCoolingState.HEAT;
               } else {
                   resultstate = Characteristic.CurrentHeatingCoolingState.OFF;
               }
           break;
           case "off":
           resultstate = Characteristic.CurrentHeatingCoolingState.OFF;
           break;
           default:
           resultstate = Characteristic.CurrentHeatingCoolingState.OFF;
           break;
       }
       //ctx.log("Simulated CurrentHeatingCoolingState " + resultstate + " " + ctx.currentTemperature + " " + ctx.targetTemperature);
       return resultstate;
    };

    this._mapFanSpeed = function(val) {
      if (val <= HK_FAN_QUIET) {
        return FJ_FAN_QUIET;
      }
      else if (val <= HK_FAN_LOW) {
        return FJ_FAN_LOW;
      }
      else if (val <= HK_FAN_MEDIUM) {
        return FJ_FAN_MEDIUM;
      }
      else {
        return FJ_FAN_HIGH;
      }
    }


    Thermostat.prototype.getCurrentHeatingCoolingState = function(cb) {
        cb(null, this.currentHeatingCoolingState);
    };

    Thermostat.prototype.getTargetHeatingCoolingState = function(cb) {
        cb(null, this.targetHeatingCoolingState);
    };

    Thermostat.prototype.setTargetHeatingCoolingState = function(val, cb) {

        let fgl_val = OPERATION_MODE[HK_MODE[val]];
        this.log("Setting Target Mode to " + fgl_val + ":" +HK_MODE[val]);
        this.service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, val);

        //this.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, val);
        this.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, this.simulatecurrentstate(this));

        //this.api.setDeviceProp(this.keyCurrentHeatingCoolingState, fgl_val, (err) =>
        if (HK_MODE[val] == "cool" && this.dryswitchstate === true) {
            fgl_val = OPERATION_MODE["dry"];
        }

        if (HK_MODE[val] == "off" && this.fgoperationmode == OPERATION_MODE["fan_only"]) {
            fgl_val = OPERATION_MODE["fan_only"];
        }

        this.api.addtoqueue({ type: "set", data: { "property": 'operation_mode', "value": fgl_val, "base_type": "integer"}}, (err) =>
        {
            cb(err);
        });
        this.api.addtoqueue({ type: "get", data: { "property": 'fan_speed'}}, (err) => { });
        this.api.keepaliveLocal(false, this.unithostname, this.localserverip, this.localserverport);

    };

    Thermostat.prototype.getCurrentTemperature = function(cb) {
        //this.log("Current "+this.currentTemperature);
        cb(null, this.currentTemperature);
    };

    Thermostat.prototype.getTargetTemperature = function(cb) {
        //this.log("Target "+this.targetTemperature);
        cb(null, this.targetTemperature);
    };

    Thermostat.prototype.setTargetTemperature = function(val, cb) {
        let roundedsettemp = (Math.round(val*2)) / 2;
        this.log("Setting Temperature to " + roundedsettemp);
        this.api.addtoqueue({ type: "set", data: { "property": 'adjust_temperature', "value": roundedsettemp*10, "base_type": "integer"}}, (err) =>
        {
          this.service.updateCharacteristic(Characteristic.TargetTemperature, roundedsettemp);
            cb(err);
        });
        this.api.addtoqueue({ type: "get", data: { "property": 'adjust_temperature'}}, (err) => { }); // added because sometimes no confirmation is sent from unit.
        this.api.keepaliveLocal(false, this.unithostname, this.localserverip, this.localserverport);
    };

    Thermostat.prototype.getTemperatureDisplayUnits = function(cb) {
        cb(null, this.temperatureDisplayUnits);
    };

    Thermostat.prototype.setTemperatureDisplayUnits = function(val, cb) {
        //this.log(val);
        this.temperatureDisplayUnits = val;
        cb();
    };

    Thermostat.prototype.getName = function(cb) {
        cb(null, this.name);
    };


    Thermostat.prototype.getDrySwitchState = function(cb) {
        cb(null, this.dryswitchstate);
    };

    Thermostat.prototype.setDrySwitchState = function(val, cb) {
        //this.log("Setting DrySwitch to " + val + HK_MODE[this.targetHeatingCoolingState]);
        if (HK_MODE[this.targetHeatingCoolingState] == "cool" && val === true) {
            this.api.addtoqueue({ type: "set", data: { "property": 'operation_mode', "value": OPERATION_MODE["dry"], "base_type": "integer"}}, (err) => { });
        }

        if (HK_MODE[this.targetHeatingCoolingState] == "cool" && val === false) {
            this.api.addtoqueue({ type: "set", data: { "property": 'operation_mode', "value": OPERATION_MODE["cool"], "base_type": "integer"}}, (err) => { });
        }
        this.dryswitchstate = val;
        this.api.keepaliveLocal(false, this.unithostname, this.localserverip, this.localserverport);
        cb();
    };

    Thermostat.prototype.getFanActive = function(cb) {
        cb(null, this.fanactive);
    };

    Thermostat.prototype.setFanActive = function(val, cb) {
        this.log("Setting Fan Active to: " + val);
        if (val == Characteristic.Active.ACTIVE) {
            if ( this.targetHeatingCoolingState == Characteristic.TargetHeatingCoolingState.OFF ) {
                this.api.addtoqueue({ type: "set", data: { "property": 'operation_mode', "value": OPERATION_MODE["fan_only"], "base_type": "integer"}}, (err) => { });
            } else {
                this.api.addtoqueue({ type: "set", data: { "property": 'fan_speed', "value": FJ_FAN_MEDIUM, "base_type": "integer"}}, (err) => { });
            }
        } else {
            if ( this.targetHeatingCoolingState == Characteristic.TargetHeatingCoolingState.OFF ) {
                this.api.addtoqueue({ type: "set", data: { "property": 'operation_mode', "value": OPERATION_MODE["off"], "base_type": "integer"}}, (err) => { });
            } else {
                this.api.addtoqueue({ type: "set", data: { "property": 'fan_speed', "value": FJ_FAN_AUTO, "base_type": "integer"}}, (err) => { });
            }
        }
        this.api.keepaliveLocal(false, this.unithostname, this.localserverip, this.localserverport);
        this.fanactive = val;
        cb()
    };

    Thermostat.prototype.getFanSwingMode = function(cb) {
        cb(null, this.fanswingmode);
    };

    Thermostat.prototype.setFanSwingMode = function(val, cb) {
        let fgl_val = parseInt(val);
        this.api.addtoqueue({ type: "set", data: { "property": 'af_vertical_swing', "value": fgl_val, "base_type": "boolean"}}, (err) =>
        {
            cb(err);
        });
        this.api.keepaliveLocal(false, this.unithostname, this.localserverip, this.localserverport);
    };

    Thermostat.prototype.getFanRotationSpeed = function(cb) {
        cb(null, this.fanrotationspeed);
    };

    Thermostat.prototype.setFanRotationSpeed = function(val, cb) {
        //let fgl_val = this._mapFanSpeed(val);
        let fgl_val = FANHK2FJ[val];
        this.log("Setting Fan Speed to FG: " + fgl_val + " , HK " + val);
        //this.log("Setting Fan Speed to FG: " + fgl_val + " : " + val + " corrected to " + FANFJ2HK[fgl_val]);
        //this.service.updateCharacteristic(Characteristic.RotationSpeed, FANFJ2HK[fgl_val]);
        //this.service.updateCharacteristic(Characteristic.TargetFanState, Characteristic.TargetFanState.MANUAL);
        //this.service.updateCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE);

        //if ( this.targetHeatingCoolingState == HK_MODE["off"] ) {
        //    this.api.addtoqueue({ type: "set", data: { "property": 'operation_mode', "value": OPERATION_MODE["fan"], "base_type": "integer"}}, (err) => { });
        //}
        this.api.addtoqueue({ type: "set", data: { "property": 'fan_speed', "value": fgl_val, "base_type": "integer"}}, (err) =>
        {
            cb(err);
        });

        this.api.keepaliveLocal(false, this.unithostname, this.localserverip, this.localserverport);

        //this.fanrotationspeed = FANFJ2HK[fgl_val];
        this.fanactive = Characteristic.Active.ACTIVE;
        this.fantargetfanstate = Characteristic.TargetFanState.MANUAL;
    };

    Thermostat.prototype.getFanTargetFanState = function(cb) {
        cb(null, this.fantargetfanstate);
    };

    Thermostat.prototype.setFanTargetFanState = function(val, cb) {
        this.log("Setting Fan State to: " + val);
        let fgl_val = null;
        if (val == Characteristic.TargetFanState.AUTO) {
            fgl_val = FJ_FAN_AUTO;
            //this.service.updateCharacteristic(Characteristic.TargetFanState, Characteristic.TargetFanState.AUTO);
            //this.service.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE);
            //this.fanactive = Characteristic.Active.INACTIVE;
            //this.fanrotationspeed = 0;

        } else {
            fgl_val = FJ_FAN_MEDIUM;
            //this.service.updateCharacteristic(Characteristic.TargetFanState, Characteristic.TargetFanState.MANUAL);
            //this.service.updateCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE);
            //this.fanactive = Characteristic.Active.ACTIVE;
            //this.fanrotationspeed = FANFJ2HK[fgl_val];
        }
        this.api.addtoqueue({ type: "set", data: { "property": 'fan_speed', "value": fgl_val, "base_type": "integer"}}, (err) =>
        {
            cb(err);
        });
        this.api.keepaliveLocal(false, this.unithostname, this.localserverip, this.localserverport);

        this.fantargetfanstate = val;
    };


    Thermostat.prototype.getServices = function() {
        this.informationService = new Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model);

        this.service
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));

        this.service
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        this.service
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        this.service
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));

        this.dryswitch
            .getCharacteristic(Characteristic.On)
            .on('get', this.getDrySwitchState.bind(this))
            .on('set', this.setDrySwitchState.bind(this));

        this.fan
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getFanActive.bind(this))
            .on('set', this.setFanActive.bind(this));

        this.fan
            .getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minValue:0 , maxValue: 4, unit: ' ' })
            .on('get', this.getFanRotationSpeed.bind(this))
            .on('set', this.setFanRotationSpeed.bind(this));

        this.fan
            .getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getFanSwingMode.bind(this))
            .on('set', this.setFanSwingMode.bind(this));

        this.fan
            .getCharacteristic(Characteristic.TargetFanState)
            .on('get', this.getFanTargetFanState.bind(this))
            .on('set', this.setFanTargetFanState.bind(this));

        const linked = [ this.dryswitch, this.fan ];
        this.service.isPrimaryService = true;
        this.service.linkedServices = linked;

        return [this.informationService, this.service, this.dryswitch, this.fan];
    };
}
